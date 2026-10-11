import { describe, expect, it } from 'vitest';
import { maintenanceRequestSchema, supplyRequestSchema, updateGustavRequestStatusSchema } from '../src/validators/gustavBiomed.validators.js';

describe('Gustav Biomed request validation', () => {
  it('accepts a categorized supply request with a positive whole quantity', () => {
    const result = supplyRequestSchema.safeParse({
      requestingUnit: 'Stores',
      supplyCategory: 'REAGENTS',
      itemDescription: 'Chemistry reagent kit',
      quantity: '3',
      quantityUnit: 'kits',
      notes: 'Confirm expiry date'
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(3);
  });

  it('rejects missing specifications, unsupported categories, and fractional quantities', () => {
    expect(supplyRequestSchema.safeParse({ requestingUnit: 'Stores', supplyCategory: 'OTHER', itemDescription: 'Kit', quantity: 1, quantityUnit: 'box' }).success).toBe(false);
    expect(supplyRequestSchema.safeParse({ requestingUnit: 'Stores', supplyCategory: 'REAGENTS', itemDescription: 'Kit', quantity: 1.5, quantityUnit: 'box' }).success).toBe(false);
  });

  it('accepts a maintenance request for a registered or manually named analyzer', () => {
    expect(maintenanceRequestSchema.safeParse({
      requestingUnit: 'Laboratory',
      analyzerDeviceId: 'analyzer-123',
      serviceDescription: 'Routine preventive maintenance'
    }).success).toBe(true);
    const manual = maintenanceRequestSchema.safeParse({
      requestingUnit: 'Laboratory',
      analyzerName: 'Chemistry analyzer A',
      serviceDescription: 'Routine preventive maintenance',
      preferredServiceDate: '2026-10-16'
    });
    expect(manual.success).toBe(true);
    if (manual.success) expect(manual.data.preferredServiceDate).toBeInstanceOf(Date);
  });

  it('requires a valid analyzer reference or name and a service description', () => {
    expect(maintenanceRequestSchema.safeParse({ requestingUnit: 'Laboratory', serviceDescription: 'Service' }).success).toBe(false);
    expect(maintenanceRequestSchema.safeParse({ requestingUnit: 'Laboratory', analyzerName: 'Chemistry analyzer', serviceDescription: 'x' }).success).toBe(false);
  });

  it('only accepts known request statuses', () => {
    expect(updateGustavRequestStatusSchema.safeParse({ status: 'SCHEDULED' }).success).toBe(true);
    expect(updateGustavRequestStatusSchema.safeParse({ status: 'PAID' }).success).toBe(false);
  });
});
