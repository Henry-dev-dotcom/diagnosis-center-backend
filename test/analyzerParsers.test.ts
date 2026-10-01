import { describe, expect, it } from 'vitest';
import { AnalyzerProtocol } from '@prisma/client';
import { detectProtocol, parseAnalyzerPayload, parseAstm, parseCsv, parseHl7, parseJson } from '../src/services/analyzer/parsers.js';

/*
  The payloads below are the shapes real instruments send, down to the quirks:
  CR-only line endings, frame numbers on ASTM records, "^^^NAME" test ids, header
  spellings that differ between vendors. A parser that only handles the tidy case
  fails on the bench, where nothing is tidy.
*/

const HL7 = [
  'MSH|^~\\&|COBAS|LAB|LHIMS|HOSP|20260301093000||ORU^R01|MSG0001|P|2.3.1',
  'PID|1||PAT-0001||MENSAH^AKOSUA||19900214|F',
  'OBR|1||SMP-0007|^^^CHEM|||20260301092000',
  'OBX|1|NM|GLU^Glucose^L||5.4|mmol/L|3.9-6.1|N|||F|||20260301092500',
  'OBX|2|NM|WBC^White cells^L||22.1|10*9/L|4.0-11.0|H|||F|||20260301092500',
  'NTE|1||Sample slightly haemolysed'
].join('\r');

const ASTM = [
  'H|\\^&|||MINDRAY^BC-5000|||||||P|1',
  'P|1||PAT-0002||OWUSU^KOFI',
  'O|1|SMP-0008||^^^CBC|R',
  'R|1|^^^WBC|6.2|10*9/L||N||F||||20260301101500',
  'R|2|^^^HGB|9.4|g/dL||L||F||||20260301101500',
  'L|1|N'
].join('\r\n');

const CSV = [
  'Sample No;Test Code;Result;Units;Flag;Date Time',
  'SMP-0009;GLU;7.8;mmol/L;H;20260301110000',
  'SMP-0009;K;4.1;mmol/L;N;20260301110000',
  'SMP-0010;GLU;3.1;mmol/L;L;20260301110500'
].join('\n');

describe('HL7 v2 ORU^R01', () => {
  it('reads the specimen id, the observations and their units', () => {
    const { protocol, readings } = parseHl7(HL7);
    expect(protocol).toBe(AnalyzerProtocol.HL7_V2);
    expect(readings).toHaveLength(1);

    const [reading] = readings;
    expect(reading.sampleId).toBe('SMP-0007');
    expect(reading.patientId).toBe('PAT-0001');
    expect(reading.instrument).toBe('COBAS');
    expect(reading.comments).toEqual(['Sample slightly haemolysed']);

    expect(reading.observations.map((observation) => observation.code)).toEqual(['GLU', 'WBC']);
    const [glucose, wbc] = reading.observations;
    expect(glucose).toMatchObject({ label: 'Glucose', value: '5.4', unit: 'mmol/L', referenceRange: '3.9-6.1', abnormalFlag: 'N', resultStatus: 'F' });
    expect(glucose.measuredAt).toBe('2026-03-01T09:25:00Z');
    expect(wbc).toMatchObject({ value: '22.1', abnormalFlag: 'H' });
  });

  it('starts a new reading at each OBR, so one message can carry several specimens', () => {
    const twoSpecimens = [
      'MSH|^~\\&|COBAS|LAB|LHIMS|HOSP|20260301093000||ORU^R01|MSG0002|P|2.3.1',
      'PID|1||PAT-0001||MENSAH^AKOSUA',
      'OBR|1||SMP-0001|^^^CHEM',
      'OBX|1|NM|GLU^Glucose||5.4|mmol/L',
      'OBR|2||SMP-0002|^^^CHEM',
      'OBX|1|NM|GLU^Glucose||9.9|mmol/L'
    ].join('\r');
    const { readings } = parseHl7(twoSpecimens);
    expect(readings.map((reading) => reading.sampleId)).toEqual(['SMP-0001', 'SMP-0002']);
    expect(readings[1].observations[0].value).toBe('9.9');
  });

  it('tolerates LF and CRLF line endings, which middleware often rewrites', () => {
    expect(parseHl7(HL7.replace(/\r/g, '\n')).readings[0].sampleId).toBe('SMP-0007');
    expect(parseHl7(HL7.replace(/\r/g, '\r\n')).readings[0].observations).toHaveLength(2);
  });

  it('refuses a payload with no MSH rather than inventing a reading', () => {
    expect(() => parseHl7('OBX|1|NM|GLU||5.4')).toThrowError(/MSH/);
  });

  it('refuses an MSH with no observations, so an empty run is not reported as success', () => {
    expect(() => parseHl7('MSH|^~\\&|COBAS|LAB|LHIMS|HOSP|20260301093000||ORU^R01|1|P|2.3.1')).toThrowError(/OBX/);
  });
});

describe('ASTM E1394', () => {
  it('reads the specimen from the O record and values from the R records', () => {
    const { protocol, readings } = parseAstm(ASTM);
    expect(protocol).toBe(AnalyzerProtocol.ASTM);
    expect(readings).toHaveLength(1);

    const [reading] = readings;
    expect(reading.sampleId).toBe('SMP-0008');
    expect(reading.patientId).toBe('PAT-0002');
    expect(reading.instrument).toBe('BC-5000');
    expect(reading.observations.map((observation) => [observation.code, observation.value, observation.unit])).toEqual([
      ['WBC', '6.2', '10*9/L'],
      ['HGB', '9.4', 'g/dL']
    ]);
    expect(reading.observations[1].abnormalFlag).toBe('L');
  });

  it('ignores the frame numbers and control characters a serial link adds', () => {
    const framed = ASTM.split('\r\n').map((line, index) => `\x02${index}${line}\x0d\x03`).join('\r\n');
    const { readings } = parseAstm(framed);
    expect(readings[0].sampleId).toBe('SMP-0008');
    expect(readings[0].observations).toHaveLength(2);
  });

  it('refuses a payload with no H record', () => {
    expect(() => parseAstm('R|1|^^^WBC|6.2')).toThrowError(/header/);
  });
});

describe('a delimited export file', () => {
  it('groups rows by specimen and finds the columns whatever they are called', () => {
    const { protocol, readings } = parseCsv(CSV);
    expect(protocol).toBe(AnalyzerProtocol.CSV);
    expect(readings.map((reading) => reading.sampleId)).toEqual(['SMP-0009', 'SMP-0010']);
    expect(readings[0].observations.map((observation) => observation.code)).toEqual(['GLU', 'K']);
    expect(readings[0].observations[0]).toMatchObject({ value: '7.8', unit: 'mmol/L', abnormalFlag: 'H' });
    expect(readings[1].observations[0].value).toBe('3.1');
  });

  it('reads comma, tab and pipe files as readily as semicolons', () => {
    for (const delimiter of [',', '\t', '|']) {
      const text = CSV.replace(/;/g, delimiter);
      expect(parseCsv(text).readings[0].observations[0].value).toBe('7.8');
    }
  });

  it('accepts the alternative header spellings instruments use', () => {
    const text = ['barcode,analyte,reading,uom', 'SMP-0011,NA,138,mmol/L'].join('\n');
    const { readings } = parseCsv(text);
    expect(readings[0].sampleId).toBe('SMP-0011');
    expect(readings[0].observations[0]).toMatchObject({ code: 'NA', value: '138', unit: 'mmol/L' });
  });

  it('keeps a quoted field containing the delimiter intact', () => {
    const text = ['sample,test,value,range', 'SMP-0012,GLU,5.4,"3.9, 6.1"'].join('\n');
    expect(parseCsv(text).readings[0].observations[0].referenceRange).toBe('3.9, 6.1');
  });

  it('says which column is missing instead of failing vaguely', () => {
    expect(() => parseCsv('sample,units\nSMP-1,mmol/L')).toThrowError(/test column/);
    expect(() => parseCsv('sample,test\nSMP-1,GLU')).toThrowError(/value column/);
    expect(() => parseCsv('test,value\nGLU,5.4')).toThrowError(/sample column/);
  });

  it('skips rows with no sample or no test rather than storing a nameless value', () => {
    const text = ['sample,test,value', 'SMP-0013,GLU,5.4', ',K,4.1', 'SMP-0013,,9.9'].join('\n');
    const { readings } = parseCsv(text);
    expect(readings).toHaveLength(1);
    expect(readings[0].observations).toHaveLength(1);
  });
});

describe('our own JSON', () => {
  it('reads a single object, an array and a readings wrapper alike', () => {
    const one = { sampleId: 'SMP-0014', results: [{ code: 'GLU', value: 5.4, unit: 'mmol/L' }] };
    for (const payload of [one, [one], { readings: [one] }]) {
      const { readings } = parseJson(JSON.stringify(payload));
      expect(readings[0].sampleId).toBe('SMP-0014');
      expect(readings[0].observations[0]).toMatchObject({ code: 'GLU', value: '5.4', unit: 'mmol/L' });
    }
  });

  it('accepts the obvious alternative field names', () => {
    const payload = { specimenId: 'SMP-0015', observations: [{ test: 'K', result: '4.1', units: 'mmol/L', flag: 'N' }] };
    const { readings } = parseJson(JSON.stringify(payload));
    expect(readings[0].sampleId).toBe('SMP-0015');
    expect(readings[0].observations[0]).toMatchObject({ code: 'K', value: '4.1', abnormalFlag: 'N' });
  });

  it('refuses malformed JSON and a payload with no results', () => {
    expect(() => parseJson('{ not json')).toThrowError(/valid JSON/);
    expect(() => parseJson('{"sampleId":"SMP-1","results":[]}')).toThrowError(/no results/);
  });
});

describe('choosing a parser', () => {
  it('reads each payload as the protocol the device is registered with', () => {
    expect(parseAnalyzerPayload(AnalyzerProtocol.HL7_V2, HL7).readings).toHaveLength(1);
    expect(parseAnalyzerPayload(AnalyzerProtocol.ASTM, ASTM).readings).toHaveLength(1);
    expect(parseAnalyzerPayload(AnalyzerProtocol.CSV, CSV).readings).toHaveLength(2);
  });

  it('fails loudly when a device is configured for the wrong dialect', () => {
    // Silently reading nothing out of a real run is the dangerous outcome here.
    expect(() => parseAnalyzerPayload(AnalyzerProtocol.HL7_V2, CSV)).toThrowError();
    expect(() => parseAnalyzerPayload(AnalyzerProtocol.ASTM, HL7)).toThrowError();
  });

  it('refuses an empty payload', () => {
    expect(() => parseAnalyzerPayload(AnalyzerProtocol.CSV, '   ')).toThrowError(/empty/);
  });

  it('recognises each dialect from the payload, for the browser upload', () => {
    expect(detectProtocol(HL7)).toBe(AnalyzerProtocol.HL7_V2);
    expect(detectProtocol(ASTM)).toBe(AnalyzerProtocol.ASTM);
    expect(detectProtocol(CSV)).toBe(AnalyzerProtocol.CSV);
    expect(detectProtocol('{"sampleId":"SMP-1"}')).toBe(AnalyzerProtocol.JSON);
  });
});
