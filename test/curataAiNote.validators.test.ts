import { describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { formatNoteWithProvider, noteFormattingRequestSchema, noteFormattingResponseSchema } from '../src/services/curataAiNote.service.js';

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

  it('passes only synthetic clinician-entered sections through the adapter and validates its source label', async () => {
    const input = { sections: { subjective: 'Synthetic sample: cough for two days.' } };
    const provider = {
      format: vi.fn(async ({ sections }) => ({
        sections: { subjective: sections.subjective, objective: '', assessment: '', plan: '' },
        source: 'CLINICIAN_ENTERED_TEXT'
      }))
    };

    const result = await formatNoteWithProvider(provider, input);

    expect(provider.format).toHaveBeenCalledOnce();
    expect(provider.format).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      sections: { subjective: 'Synthetic sample: cough for two days.', objective: '', assessment: '', plan: '' },
      source: 'CLINICIAN_ENTERED_TEXT'
    });
  });

  it('does not call a provider when the request contains anything beyond clinician-entered SOAP text', async () => {
    const provider = { format: vi.fn() };

    await expect(formatNoteWithProvider(provider, {
      sections: { subjective: 'Synthetic sample.' },
      encounterId: 'not-allowed'
    })).rejects.toThrow();

    expect(provider.format).not.toHaveBeenCalled();
  });

  it('rejects provider output that adds a field or misstates its source', async () => {
    const provider = {
      format: async () => ({
        sections: { subjective: 'Synthetic sample.', objective: '', assessment: '', plan: '' },
        source: 'PATIENT_CHART',
        diagnosis: 'not allowed'
      })
    };

    await expect(formatNoteWithProvider(provider, { sections: { subjective: 'Synthetic sample.' } })).rejects.toThrow();
  });
});
