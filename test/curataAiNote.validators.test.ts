import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { noteFormattingRequestSchema, noteFormattingResponseSchema } from '../src/services/curataAiNote.service.js';

describe('CurataAI note-format foundation contracts', () => {
  it('keeps the feature flag off by default', () => {
    expect(env.CURATAAI_NOTE_FORMATTING_ENABLED).toBe(false);
  });

  it('accepts only clinician-entered SOAP text', () => {
    expect(noteFormattingRequestSchema.parse({ sections: { subjective: 'Patient reports cough.' } })).toEqual({
      sections: { subjective: 'Patient reports cough.' }
    });
  });

  it('rejects empty notes, patient chart context, diagnoses, and extra fields', () => {
    expect(noteFormattingRequestSchema.safeParse({ sections: {} }).success).toBe(false);
    expect(noteFormattingRequestSchema.safeParse({ sections: { subjective: 'Cough' }, patient: { id: 'p1' } }).success).toBe(false);
    expect(noteFormattingRequestSchema.safeParse({ sections: { subjective: 'Cough', diagnoses: ['...'] } }).success).toBe(false);
  });

  it('rejects a section that exceeds the current editor limit', () => {
    expect(noteFormattingRequestSchema.safeParse({ sections: { plan: 'x'.repeat(5001) } }).success).toBe(false);
  });

  it('accepts only four editable note sections in a provider response', () => {
    const response = {
      sections: { subjective: 'History', objective: '', assessment: '', plan: '' },
      source: 'CLINICIAN_ENTERED_TEXT'
    };
    expect(noteFormattingResponseSchema.parse(response)).toEqual(response);
    expect(noteFormattingResponseSchema.safeParse({ ...response, prescription: 'Medicine' }).success).toBe(false);
    expect(noteFormattingResponseSchema.safeParse({ ...response, source: 'PATIENT_CHART' }).success).toBe(false);
  });
});
