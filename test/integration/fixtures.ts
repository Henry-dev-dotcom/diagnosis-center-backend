// Both facilities receive identical demo data (same usernames, same patients);
// only the id prefix differs, which is exactly what isolation must survive.
// Alpha routes clinicians' orders through reception, the way a diagnostic centre
// does, so the reception confirmation and routing flow stays covered. Bravo does
// not, the way a hospital or clinic does, so the direct-to-bench flow is covered
// too. Both are exercised by the suite.
export const FACILITY_A = { id: 'fac_alpha', code: 'ALPHA', name: 'Alpha Hospital', idPrefix: '', receptionConfirmsOrders: true };
export const FACILITY_B = { id: 'fac_bravo', code: 'BRAVO', name: 'Bravo Clinic', idPrefix: 'B-', receptionConfirmsOrders: false };

export const DEMO_USERS = {
  admin: 'admin123',
  doctor: 'doctor123',
  reception: 'reception123',
  lab: 'lab123',
  scan: 'scan123',
  billing: 'billing123',
  nurse: 'nurse123',
  pharmacist: 'pharmacist123'
} as const;
