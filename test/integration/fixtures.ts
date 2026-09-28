// Both facilities receive identical demo data (same usernames, same patients);
// only the id prefix differs, which is exactly what isolation must survive.
export const FACILITY_A = { id: 'fac_alpha', code: 'ALPHA', name: 'Alpha Hospital', idPrefix: '' };
export const FACILITY_B = { id: 'fac_bravo', code: 'BRAVO', name: 'Bravo Clinic', idPrefix: 'B-' };

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
