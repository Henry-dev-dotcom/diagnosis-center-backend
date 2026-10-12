import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/services/prisma.service.js';
import { runWithFacility } from '../../src/services/tenantContext.js';
import { DEMO_USERS, FACILITY_A, FACILITY_B } from './fixtures.js';

/*
  The patient directory, a past visit, and the document vault.

  Finding a patient must work however the clinician happens to have them (name, phone,
  date of birth, Ghana Card, NHIS number); reading a visit must be logged; and the vault
  must take only what it says it takes, keep it byte for byte, and never serve a disguised
  file back.
*/

let server: Server;
let baseUrl: string;
const tokens: Record<string, string> = {};

async function request(path: string, init: RequestInit & { as?: string; facility?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (init.as) headers.set('authorization', `Bearer ${tokens[`${init.facility ?? FACILITY_A.code}:${init.as}`]}`);
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* a file, not JSON */ }
  return { status: response.status, text, json, bytes, headers: response.headers };
}
const get = (path: string, as: string, facility?: string) => request(path, { as, facility });
const post = (path: string, as: string, body: unknown = {}, facility?: string) => request(path, { method: 'POST', as, facility, body: JSON.stringify(body) });

async function signIn(facility: string, username: keyof typeof DEMO_USERS) {
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facilityCode: facility, username, password: DEMO_USERS[username] }) });
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  tokens[`${facility}:${username}`] = json.data.accessToken;
}

const years = (n: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d; };
const directory = async (query: string, as = 'doctor', facility?: string) => get(`/records/directory${query}`, as, facility);
const names = (res: { json: any }) => (res.json.data.items as Array<{ firstName: string }>).map((p) => p.firstName);

const TAG = `Dir${Date.now().toString(36)}`;
let amaId: string;
let visitId: string;

beforeAll(async () => {
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const user of ['doctor', 'nurse', 'reception', 'billing', 'lab', 'admin'] as const) await signIn(FACILITY_A.code, user);
  await signIn(FACILITY_B.code, 'admin');

  await runWithFacility(FACILITY_A.id, async () => {
    const ama = await prisma.patient.create({
      data: {
        patientCode: `PAT-DIR-1-${TAG}`, firstName: `Ama${TAG}`, lastName: 'Boateng', phone: '+233241234567',
        dateOfBirth: new Date(Date.UTC(1980, 2, 4)), gender: 'FEMALE', nationalId: `GHA-${TAG}-7`
      }
    });
    amaId = ama.id;
    await prisma.patientInsurance.create({ data: { patientId: ama.id, provider: 'NHIS', policyNumber: `NHIS-${TAG}-55` } });
    // Shares Ama's last name: a search for both names must not return him.
    await prisma.patient.create({ data: { patientCode: `PAT-DIR-4-${TAG}`, firstName: `Kwame${TAG}`, lastName: 'Boateng', phone: '+233200000333', gender: 'MALE' } });
    await prisma.patient.create({ data: { patientCode: `PAT-DIR-2-${TAG}`, firstName: `Kojo${TAG}`, lastName: 'Child', phone: '+233200000111', dateOfBirth: years(5), gender: 'MALE' } });
    await prisma.patient.create({ data: { patientCode: `PAT-DIR-3-${TAG}`, firstName: `Yaa${TAG}`, lastName: 'Elder', phone: '+233200000222', dateOfBirth: years(72), gender: 'FEMALE' } });

    // Ama has two visits (the later one is her "last visit") and a long-term condition.
    const first = await prisma.encounter.create({ data: { encounterCode: `ENC-DIR-1-${TAG}`, patientId: ama.id, type: 'OPD', status: 'COMPLETED', chiefComplaint: 'Old cough', startedAt: new Date('2026-01-10T09:00:00Z'), completedAt: new Date('2026-01-10T10:00:00Z'), outcome: 'DISCHARGED' } });
    const second = await prisma.encounter.create({ data: { encounterCode: `ENC-DIR-2-${TAG}`, patientId: ama.id, type: 'OPD', status: 'COMPLETED', chiefComplaint: 'Recent fever', startedAt: new Date(Date.now() - 3 * 86_400_000), completedAt: new Date(Date.now() - 3 * 86_400_000 + 3_600_000), outcome: 'DISCHARGED' } });
    visitId = second.id;
    await prisma.diagnosis.create({ data: { encounterId: first.id, patientId: ama.id, code: 'I10', description: 'Hypertension', isChronic: true } });
    await prisma.clinicalNote.create({ data: { encounterId: second.id, patientId: ama.id, type: 'CONSULTATION', subjective: 'Fever for two days', assessment: 'Viral illness', plan: 'Fluids and rest' } });
    await prisma.vitalSigns.create({ data: { encounterId: second.id, patientId: ama.id, temperatureC: 38.4, pulseBpm: 92 } });
  });
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('finding a patient', () => {
  it('finds someone by first and last name together, in either order', async () => {
    expect(names(await directory(`?search=ama${TAG.toLowerCase()} boateng`))).toEqual([`Ama${TAG}`]);
    expect(names(await directory(`?search=boateng ama${TAG.toLowerCase()}`))).toEqual([`Ama${TAG}`]);
    // One shared name finds both people; the second word is what narrows it.
    expect(names(await directory(`?search=boateng ${TAG.toLowerCase()}`)).sort()).toEqual([`Ama${TAG}`, `Kwame${TAG}`]);
  });

  it('finds someone by phone number however it is typed', async () => {
    for (const typed of ['0241234567', '024 123 4567', '+233 24 123 4567', '233241234567']) {
      const res = await directory(`?search=${encodeURIComponent(typed)}`);
      expect(names(res), `searching "${typed}"`).toContain(`Ama${TAG}`);
    }
  });

  it('finds someone by date of birth in the forms people write it', async () => {
    for (const typed of ['1980-03-04', '04/03/1980', '04-03-1980', '04.03.1980']) {
      const res = await directory(`?search=${encodeURIComponent(typed)}`);
      expect(names(res), `searching "${typed}"`).toContain(`Ama${TAG}`);
    }
    expect(names(await directory(`?search=${encodeURIComponent('05/03/1980')}`))).not.toContain(`Ama${TAG}`);
  });

  it('finds someone by Ghana Card and by NHIS number, and by patient number', async () => {
    expect(names(await directory(`?search=GHA-${TAG}-7`))).toEqual([`Ama${TAG}`]);
    expect(names(await directory(`?search=NHIS-${TAG}-55`))).toEqual([`Ama${TAG}`]);
    expect(names(await directory(`?search=PAT-DIR-1-${TAG}`))).toEqual([`Ama${TAG}`]);
  });

  it('shows when each patient was last seen, whether they are allergic or long-term unwell', async () => {
    const res = await directory(`?search=${TAG}`);
    const ama = res.json.data.items.find((p: { firstName: string }) => p.firstName === `Ama${TAG}`);
    expect(new Date(ama.lastVisitAt).getTime(), 'the later of her two visits').toBeGreaterThan(Date.now() - 4 * 86_400_000);
    expect(ama.chronicConditions).toEqual(['Hypertension']);
    const child = res.json.data.items.find((p: { firstName: string }) => p.firstName === `Kojo${TAG}`);
    expect(child.lastVisitAt).toBeNull();
    expect(child.chronicConditions).toEqual([]);
  });

  it('filters by group: long-term conditions, children, older people, recent visits', async () => {
    expect(names(await directory(`?search=${TAG}&cohort=chronic`))).toEqual([`Ama${TAG}`]);
    expect(names(await directory(`?search=${TAG}&cohort=paediatric`))).toEqual([`Kojo${TAG}`]);
    expect(names(await directory(`?search=${TAG}&cohort=older`))).toEqual([`Yaa${TAG}`]);
    expect(names(await directory(`?search=${TAG}&cohort=recent`))).toEqual([`Ama${TAG}`]);
    expect((await directory('?cohort=nonsense')).status).toBe(400);
  });

  it('pages its results and says how many there are', async () => {
    const res = await directory(`?search=${TAG}&limit=2&page=1`);
    expect(res.json.data.items).toHaveLength(2);
    expect(res.json.data.meta).toMatchObject({ total: 4, page: 1, limit: 2, totalPages: 2, hasNextPage: true });
    expect((await directory(`?search=${TAG}&limit=2&page=2`)).json.data.items).toHaveLength(2);
    expect((await directory('?limit=500')).status).toBe(400);
  });

  it('is for clinical staff: billing and the lab bench cannot use it, another hospital sees none of these patients', async () => {
    expect((await directory(`?search=${TAG}`, 'billing')).status).toBe(403);
    expect((await directory(`?search=${TAG}`, 'lab')).status).toBe(403);
    expect((await directory(`?search=${TAG}`, 'nurse')).status).toBe(200);
    const other = await directory(`?search=${TAG}`, 'admin', FACILITY_B.code);
    expect(other.status).toBe(200);
    expect(other.json.data.items).toEqual([]);
  });
});

describe('a past visit', () => {
  it('returns the notes, vitals and diagnoses, and logs who read it and why', async () => {
    const res = await get(`/records/patients/${amaId}/encounters/${visitId}?purpose=TREATMENT`, 'doctor');
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.notes[0]).toMatchObject({ subjective: 'Fever for two days', assessment: 'Viral illness', plan: 'Fluids and rest' });
    expect(Number(res.json.data.vitalSigns[0].temperatureC)).toBe(38.4);

    const logged = await runWithFacility(FACILITY_A.id, () => prisma.chartAccess.findMany({ where: { patientId: amaId, note: { contains: `ENC-DIR-2-${TAG}` } } }));
    expect(logged).toHaveLength(1);
    expect(logged[0].purpose).toBe('TREATMENT');
  });

  it('refuses to be read without a stated purpose, and does not find a visit on the wrong patient', async () => {
    expect((await get(`/records/patients/${amaId}/encounters/${visitId}`, 'doctor')).status).toBe(400);
    const other = await runWithFacility(FACILITY_A.id, async () => (await prisma.patient.findFirstOrThrow({ where: { patientCode: `PAT-DIR-2-${TAG}` } })).id);
    expect((await get(`/records/patients/${other}/encounters/${visitId}?purpose=TREATMENT`, 'doctor')).status).toBe(404);
  });

  it('is not readable from another hospital', async () => {
    expect((await get(`/records/patients/${amaId}/encounters/${visitId}?purpose=TREATMENT`, 'admin', FACILITY_B.code)).status).toBe(404);
  });
});

describe('the document vault', () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n% referral letter\n'), Buffer.alloc(300, 7), Buffer.from('\n%%EOF')]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 3)]);
  const upload = (as: string, body: Record<string, unknown>, facility?: string) => post(`/records/patients/${amaId}/documents`, as, { title: 'Referral letter', category: 'REFERRAL_LETTER', fileName: 'letter.pdf', contentBase64: pdf.toString('base64'), ...body }, facility);

  it('files a PDF, lists it, and gives back exactly the same bytes as a download', async () => {
    const filed = await upload('doctor', {});
    expect(filed.status, filed.text).toBe(201);
    expect(filed.json.data).toMatchObject({ title: 'Referral letter', category: 'REFERRAL_LETTER', mimeType: 'application/pdf', sizeBytes: pdf.length });
    expect(filed.json.data.content, 'the list never carries the file itself').toBeUndefined();

    const listed = await get(`/records/patients/${amaId}/documents`, 'nurse');
    expect(listed.json.data.items.map((d: { id: string }) => d.id)).toContain(filed.json.data.id);
    expect(listed.text).not.toContain('%PDF');

    const download = await get(`/records/documents/${filed.json.data.id}/download`, 'doctor');
    expect(download.status).toBe(200);
    expect(download.bytes.equals(pdf), 'the file must come back byte for byte').toBe(true);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('content-disposition')).toMatch(/^attachment; filename="letter\.pdf"$/);
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    expect(download.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('decides the type from the bytes, not the name: a picture named .pdf is stored as the picture it is', async () => {
    const filed = await upload('doctor', { fileName: 'scan.pdf', contentBase64: png.toString('base64') });
    expect(filed.status, filed.text).toBe(201);
    expect(filed.json.data.mimeType).toBe('image/png');
    expect(filed.json.data.fileName).toBe('scan.png');
  });

  it('refuses anything a browser could run, however it is labelled', async () => {
    for (const [name, content] of [
      ['page.pdf', '<html><script>alert(1)</script></html>'],
      ['image.png', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
      ['run.pdf', 'MZ\u0000\u0000\u0000 not a document'],
      ['empty.pdf', '']
    ] as const) {
      const res = await upload('doctor', { fileName: name, contentBase64: Buffer.from(content).toString('base64') || 'AAAA' });
      expect([400, 415], `${name}: ${res.text}`).toContain(res.status);
    }
    const html = await upload('doctor', { fileName: 'page.pdf', contentBase64: Buffer.from('<html></html>').toString('base64') });
    expect(html.json.code).toBe('DOCUMENT_TYPE_NOT_ALLOWED');
  });

  it('refuses a file over the size limit, and text that is not base64', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024, 1)]);
    const res = await upload('doctor', { contentBase64: big.toString('base64') });
    expect(res.status).toBe(413);
    expect(res.json.code).toBe('DOCUMENT_TOO_LARGE');
    expect((await upload('doctor', { contentBase64: '%%% not base64 %%%' })).status).toBe(400);
  });

  it('needs a title, and only people who may file documents can: billing and the lab bench cannot', async () => {
    expect((await upload('doctor', { title: '' })).status).toBe(400);
    expect((await upload('billing', {})).status).toBe(403);
    expect((await upload('lab', {})).status).toBe(403);
    expect((await upload('nurse', {})).status).toBe(201);
    expect((await upload('reception', {})).status).toBe(201);
  });

  it('records that a document was filed and opened, without recording what it said', async () => {
    const filed = await upload('doctor', { title: 'Consent form' });
    await get(`/records/documents/${filed.json.data.id}/download`, 'doctor');
    const entries = await runWithFacility(FACILITY_A.id, () => prisma.auditLog.findMany({ where: { entityId: filed.json.data.id } }));
    expect(entries.map((e) => e.action).sort()).toEqual(['PATIENT_DOCUMENT_OPENED', 'PATIENT_DOCUMENT_UPLOADED']);
    expect(JSON.stringify(entries)).not.toContain('referral letter');
  });

  it('belongs to one hospital: another cannot list, open or add to it', async () => {
    const filed = await upload('doctor', {});
    expect((await get(`/records/documents/${filed.json.data.id}/download`, 'admin', FACILITY_B.code)).status).toBe(404);
    expect((await get(`/records/patients/${amaId}/documents`, 'admin', FACILITY_B.code)).status).toBe(404);
    expect((await upload('admin', {}, FACILITY_B.code)).status).toBe(404);
  });
});
