import { AnalyzerProtocol } from '@prisma/client';
import { AppError } from '../../utils/appError.js';

/*
  Turning what an analyzer says into one shape.

  Four dialects reach us (see docs/ANALYZER_INTERFACING.md):
    - HL7 v2 ORU^R01, which most modern instruments and middleware speak;
    - ASTM E1381/E1394 records, still the only option on older serial analyzers;
    - a delimited file the instrument writes to disk;
    - our own JSON, for a custom integration.

  Everything below is pure text handling: no database, no clock, no network, so
  it can be tested against real captured messages. Nothing here decides what a
  value means — that is mapping's job, in ingest.service.ts.
*/

export type AnalyzerObservation = {
  /** The analyzer's own test code, e.g. "GLU". This is what mapping matches on. */
  code: string;
  /** The analyzer's own label for the test, when it sends one. */
  label: string | null;
  value: string;
  unit: string | null;
  /** The analyzer's own abnormal marker, e.g. "H", "L", "HH". Advisory only. */
  abnormalFlag: string | null;
  /** The analyzer's own reference range, used only when we have none. */
  referenceRange: string | null;
  measuredAt: string | null;
  /** The instrument's own result status, e.g. HL7 OBX-11 "F" (final) or "P". */
  resultStatus: string | null;
};

export type AnalyzerReading = {
  /** The specimen id the analyzer was given. We match this to a sample. */
  sampleId: string | null;
  /** The analyzer's own patient id, when sent. Used only to warn on a mismatch. */
  patientId: string | null;
  instrument: string | null;
  observations: AnalyzerObservation[];
  comments: string[];
};

export type ParsedPayload = {
  protocol: AnalyzerProtocol;
  readings: AnalyzerReading[];
};

function clean(value: string | undefined | null) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** HL7 and ASTM both separate records with CR; tolerate LF and CRLF too. */
function splitRecords(text: string) {
  return text
    .replace(/\r\n/g, '\r')
    .replace(/\n/g, '\r')
    .split('\r')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/* ----------------------------------------------------------------- HL7 v2 -- */

/*
  An ORU^R01 looks like:
    MSH|^~\&|COBAS|LAB|LHIMS|HOSP|20260101120000||ORU^R01|1|P|2.3.1
    PID|1||PAT-0001||MENSAH^AKOSUA
    OBR|1||SMP-0007|^^^CHEM
    OBX|1|NM|GLU^Glucose||5.4|mmol/L|3.9-6.1|N|||F|||20260101115500
  Each OBR starts a new specimen; the OBX lines under it are its observations.
*/
export function parseHl7(text: string): ParsedPayload {
  const records = splitRecords(text);
  const msh = records.find((line) => line.startsWith('MSH'));
  if (!msh) throw new AppError('This does not look like an HL7 message: no MSH segment', 422, 'ANALYZER_PAYLOAD_UNPARSEABLE');

  // MSH-1 is the field separator itself, and MSH-2 holds the component separator.
  const fieldSep = msh.charAt(3) || '|';
  const encoding = msh.split(fieldSep)[1] ?? '^~\\&';
  const componentSep = encoding.charAt(0) || '^';
  const repeatSep = encoding.charAt(1) || '~';

  const fields = (line: string) => line.split(fieldSep);
  const component = (value: string | undefined, index: number) => clean(value?.split(componentSep)[index]);

  const sendingApplication = component(fields(msh)[2], 0);
  const readings: AnalyzerReading[] = [];
  let patientId: string | null = null;
  let current: AnalyzerReading | null = null;

  const start = (sampleId: string | null): AnalyzerReading => {
    const reading: AnalyzerReading = { sampleId, patientId, instrument: sendingApplication, observations: [], comments: [] };
    readings.push(reading);
    return reading;
  };

  for (const line of records) {
    const parts = fields(line);
    const segment = parts[0];

    if (segment === 'PID') {
      // PID-3 can repeat (several identifiers); the first is the primary one.
      patientId = component(parts[3]?.split(repeatSep)[0], 0);
      if (current) current.patientId = patientId;
      continue;
    }

    if (segment === 'OBR') {
      // OBR-3 is the filler order number, which is where instruments put the
      // specimen barcode. OBR-2 (placer order number) is the usual fallback.
      current = start(component(parts[3], 0) ?? component(parts[2], 0));
      continue;
    }

    if (segment === 'OBX') {
      const reading = current ?? (current = start(null));
      const code = component(parts[3], 0);
      if (!code) continue;
      reading.observations.push({
        code,
        label: component(parts[3], 1),
        // OBX-5 can repeat for a multi-part answer; join rather than lose any of it.
        value: (clean(parts[5]) ?? '').split(repeatSep).map((part) => part.split(componentSep)[0]).join(' ').trim(),
        unit: component(parts[6], 0),
        referenceRange: clean(parts[7]),
        abnormalFlag: clean(parts[8]),
        resultStatus: clean(parts[11]),
        measuredAt: hl7Timestamp(clean(parts[14]))
      });
      continue;
    }

    if (segment === 'NTE') {
      const note = clean(parts[3]);
      if (note && current) current.comments.push(note);
    }
  }

  if (readings.length === 0) throw new AppError('The HL7 message carried no OBX observation segments', 422, 'ANALYZER_NO_OBSERVATIONS');
  return { protocol: AnalyzerProtocol.HL7_V2, readings };
}

/** HL7 and ASTM both use YYYYMMDDHHMMSS, with the time optional. */
function hl7Timestamp(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const [y, m, d] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)];
  const [hh, mm, ss] = [digits.slice(8, 10) || '00', digits.slice(10, 12) || '00', digits.slice(12, 14) || '00'];
  const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/* ------------------------------------------------------------------- ASTM -- */

/*
  ASTM E1394 records, one per line, each numbered:
    H|\^&|||MINDRAY^BC-5000|||||||P|1
    P|1||PAT-0001||MENSAH^AKOSUA
    O|1|SMP-0007||^^^CBC|R
    R|1|^^^WBC|6.2|10*9/L||N||F||||20260101115500
    L|1|N
  An O record starts a specimen; the R records under it are its results.
*/
export function parseAstm(text: string): ParsedPayload {
  // STX and ETX are the frame markers a serial link puts around each record;
  // matching them literally is the point, so the control-character rule is off here.
  // eslint-disable-next-line no-control-regex
  const records = splitRecords(text).map((line) => line.replace(/^\x02/, '').replace(/\x03.*$/, ''));
  if (!records.some((line) => /^\d*H\|/.test(line) || line.startsWith('H|'))) {
    throw new AppError('This does not look like an ASTM message: no H (header) record', 422, 'ANALYZER_PAYLOAD_UNPARSEABLE');
  }

  const readings: AnalyzerReading[] = [];
  let patientId: string | null = null;
  let instrument: string | null = null;
  let current: AnalyzerReading | null = null;

  const start = (sampleId: string | null): AnalyzerReading => {
    const reading: AnalyzerReading = { sampleId, patientId, instrument, observations: [], comments: [] };
    readings.push(reading);
    return reading;
  };

  for (const line of records) {
    // A record may be prefixed with its frame number, as in "2P|1|...".
    const body = line.replace(/^\d+/, '');
    const parts = body.split('|');
    const type = (parts[0] ?? '').toUpperCase();
    // ASTM components are ^-separated; a test id is "^^^NAME".
    const lastComponent = (value: string | undefined) => {
      const pieces = (value ?? '').split('^').map((piece) => piece.trim()).filter((piece) => piece !== '');
      return pieces.length ? pieces[pieces.length - 1] : null;
    };

    if (type === 'H') {
      instrument = lastComponent(parts[4]);
      continue;
    }
    if (type === 'P') {
      patientId = clean(parts[3]) ?? clean(parts[2]);
      if (current) current.patientId = patientId;
      continue;
    }
    if (type === 'O') {
      // O-3 is the specimen id; O-4 the instrument's own id for it.
      current = start(clean(parts[2]) ?? clean(parts[3]));
      continue;
    }
    if (type === 'R') {
      const reading = current ?? (current = start(null));
      const code = lastComponent(parts[2]);
      if (!code) continue;
      reading.observations.push({
        code,
        label: null,
        value: clean(parts[3]) ?? '',
        unit: clean(parts[4]),
        referenceRange: clean(parts[5]),
        abnormalFlag: clean(parts[6]),
        resultStatus: clean(parts[8]),
        measuredAt: hl7Timestamp(clean(parts[12]) ?? clean(parts[11]))
      });
      continue;
    }
    if (type === 'C') {
      const note = clean(parts[3]);
      if (note && current) current.comments.push(note);
    }
  }

  if (readings.length === 0) throw new AppError('The ASTM message carried no R (result) records', 422, 'ANALYZER_NO_OBSERVATIONS');
  return { protocol: AnalyzerProtocol.ASTM, readings };
}

/* -------------------------------------------------------------------- CSV -- */

/*
  Column names differ between instruments, so each field accepts the spellings
  seen in practice rather than demanding one exact header.
*/
const CSV_COLUMNS = {
  sampleId: ['sampleid', 'sample', 'sample_id', 'sampleno', 'sample_no', 'specimen', 'specimenid', 'specimen_id', 'barcode', 'barcodeid', 'accession', 'accessionno', 'sid'],
  patientId: ['patientid', 'patient', 'patient_id', 'patientno', 'pid'],
  code: ['test', 'testcode', 'test_code', 'code', 'analyte', 'parameter', 'param', 'testid', 'test_id', 'testname', 'test_name'],
  value: ['value', 'result', 'resultvalue', 'result_value', 'reading', 'measurement'],
  unit: ['unit', 'units', 'uom'],
  flag: ['flag', 'flags', 'abnormal', 'abnormalflag', 'abnormal_flag'],
  referenceRange: ['range', 'refrange', 'ref_range', 'referencerange', 'reference_range', 'normalrange', 'normal_range'],
  measuredAt: ['datetime', 'date_time', 'timestamp', 'measuredat', 'measured_at', 'resultdate', 'result_date', 'date', 'time', 'completed', 'completedat']
} as const;

function splitDelimited(line: string, delimiter: string) {
  // Quoted fields may contain the delimiter, and "" is an escaped quote.
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { out.push(field); field = ''; continue; }
    field += char;
  }
  out.push(field);
  return out.map((value) => value.trim());
}

export function parseCsv(text: string): ParsedPayload {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) throw new AppError('The file needs a header row and at least one result row', 422, 'ANALYZER_PAYLOAD_UNPARSEABLE');

  // Pick the delimiter the header actually uses, rather than assuming a comma.
  const header = lines[0];
  const delimiter = [',', ';', '\t', '|'].reduce((best, candidate) => (splitDelimited(header, candidate).length > splitDelimited(header, best).length ? candidate : best), ',');
  const columns = splitDelimited(header, delimiter).map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const indexOf = (names: readonly string[]) => columns.findIndex((column) => names.includes(column));
  const at = {
    sampleId: indexOf(CSV_COLUMNS.sampleId),
    patientId: indexOf(CSV_COLUMNS.patientId),
    code: indexOf(CSV_COLUMNS.code),
    value: indexOf(CSV_COLUMNS.value),
    unit: indexOf(CSV_COLUMNS.unit),
    flag: indexOf(CSV_COLUMNS.flag),
    referenceRange: indexOf(CSV_COLUMNS.referenceRange),
    measuredAt: indexOf(CSV_COLUMNS.measuredAt)
  };

  if (at.sampleId < 0) throw new AppError(`No sample column found. The header needs one of: ${CSV_COLUMNS.sampleId.slice(0, 6).join(', ')}`, 422, 'ANALYZER_CSV_NO_SAMPLE_COLUMN');
  if (at.code < 0) throw new AppError(`No test column found. The header needs one of: ${CSV_COLUMNS.code.slice(0, 6).join(', ')}`, 422, 'ANALYZER_CSV_NO_TEST_COLUMN');
  if (at.value < 0) throw new AppError(`No value column found. The header needs one of: ${CSV_COLUMNS.value.slice(0, 5).join(', ')}`, 422, 'ANALYZER_CSV_NO_VALUE_COLUMN');

  // One reading per specimen, in the order the file first mentions each.
  const bySample = new Map<string, AnalyzerReading>();
  for (const line of lines.slice(1)) {
    const cells = splitDelimited(line, delimiter);
    const pick = (index: number) => (index >= 0 ? clean(cells[index]) : null);
    const sampleId = pick(at.sampleId);
    const code = pick(at.code);
    if (!sampleId || !code) continue;

    const key = sampleId.toUpperCase();
    let reading = bySample.get(key);
    if (!reading) {
      reading = { sampleId, patientId: pick(at.patientId), instrument: null, observations: [], comments: [] };
      bySample.set(key, reading);
    }
    const measuredAt = pick(at.measuredAt);
    reading.observations.push({
      code,
      label: null,
      value: pick(at.value) ?? '',
      unit: pick(at.unit),
      referenceRange: pick(at.referenceRange),
      abnormalFlag: pick(at.flag),
      resultStatus: null,
      measuredAt: measuredAt ? csvTimestamp(measuredAt) : null
    });
  }

  const readings = [...bySample.values()];
  if (readings.length === 0) throw new AppError('No rows in the file had both a sample and a test', 422, 'ANALYZER_NO_OBSERVATIONS');
  return { protocol: AnalyzerProtocol.CSV, readings };
}

function csvTimestamp(value: string) {
  // An all-digit stamp is the HL7 form; otherwise let Date read it, and keep the
  // original text out of the record rather than storing a wrong instant.
  if (/^[0-9]{8,14}$/.test(value)) return hl7Timestamp(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/* ------------------------------------------------------------------- JSON -- */

/*
  Our own shape, for an in-house integration:
    { "sampleId": "SMP-0007", "results": [{ "code": "GLU", "value": "5.4", "unit": "mmol/L" }] }
  A bare array, a single object, or { readings: [...] } are all accepted.
*/
export function parseJson(text: string): ParsedPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new AppError('The payload is not valid JSON', 422, 'ANALYZER_PAYLOAD_UNPARSEABLE');
  }

  const asRecord = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
  const str = (value: unknown) => (typeof value === 'string' ? clean(value) : typeof value === 'number' ? String(value) : null);

  const root = asRecord(payload);
  const rawReadings: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.readings)
      ? (root!.readings as unknown[])
      : root
        ? [root]
        : [];

  const readings: AnalyzerReading[] = [];
  for (const entry of rawReadings) {
    const record = asRecord(entry);
    if (!record) continue;
    const rawObservations = (Array.isArray(record.results) ? record.results : Array.isArray(record.observations) ? record.observations : []) as unknown[];
    const observations: AnalyzerObservation[] = [];
    for (const item of rawObservations) {
      const observation = asRecord(item);
      const code = observation ? str(observation.code ?? observation.test ?? observation.testCode ?? observation.name) : null;
      if (!observation || !code) continue;
      const measuredAt = str(observation.measuredAt ?? observation.dateTime ?? observation.timestamp);
      observations.push({
        code,
        label: str(observation.label ?? observation.name),
        value: str(observation.value ?? observation.result) ?? '',
        unit: str(observation.unit ?? observation.units),
        referenceRange: str(observation.referenceRange ?? observation.range),
        abnormalFlag: str(observation.flag ?? observation.abnormalFlag),
        resultStatus: str(observation.status ?? observation.resultStatus),
        measuredAt: measuredAt ? csvTimestamp(measuredAt) : null
      });
    }
    readings.push({
      sampleId: str(record.sampleId ?? record.sampleCode ?? record.specimenId ?? record.barcode),
      patientId: str(record.patientId ?? record.patientCode),
      instrument: str(record.instrument ?? record.analyzer ?? record.device),
      observations,
      comments: Array.isArray(record.comments) ? (record.comments as unknown[]).map(str).filter((note): note is string => Boolean(note)) : []
    });
  }

  if (readings.length === 0 || readings.every((reading) => reading.observations.length === 0)) {
    throw new AppError('The JSON payload carried no results', 422, 'ANALYZER_NO_OBSERVATIONS');
  }
  return { protocol: AnalyzerProtocol.JSON, readings };
}

/* --------------------------------------------------------------- dispatch -- */

/**
 * Parse a payload as the protocol the device is registered with. An instrument
 * that is simply configured differently to its registration would otherwise be
 * a silent failure, so a mismatch is reported as a parse error the bench can read.
 */
export function parseAnalyzerPayload(protocol: AnalyzerProtocol, text: string): ParsedPayload {
  if (!text || text.trim() === '') throw new AppError('The payload was empty', 422, 'ANALYZER_PAYLOAD_EMPTY');
  switch (protocol) {
    case AnalyzerProtocol.HL7_V2:
      return parseHl7(text);
    case AnalyzerProtocol.ASTM:
      return parseAstm(text);
    case AnalyzerProtocol.CSV:
      return parseCsv(text);
    case AnalyzerProtocol.JSON:
      return parseJson(text);
    default:
      throw new AppError('This analyzer is registered with a protocol we cannot read', 500, 'ANALYZER_PROTOCOL_UNKNOWN');
  }
}

/**
 * Guess the protocol from the payload itself, for the browser upload where the
 * person is choosing a file rather than configuring an instrument.
 */
export function detectProtocol(text: string): AnalyzerProtocol | null {
  const head = text.trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return AnalyzerProtocol.JSON;
  if (/(^|[\r\n])MSH[|]/.test(text)) return AnalyzerProtocol.HL7_V2;
  if (/(^|[\r\n])\d*H[|\\]/.test(text) && /(^|[\r\n])\d*R[|]/.test(text)) return AnalyzerProtocol.ASTM;
  if (text.includes('\n') || text.includes('\r')) return AnalyzerProtocol.CSV;
  return null;
}
