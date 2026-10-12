import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { createAuditLog, getRequestAuditContext } from './audit.service.js';
import { prisma } from './prisma.service.js';
import { AppError } from '../utils/appError.js';

const noteSectionsSchema = z
  .object({
    subjective: z.string().max(5000).optional(),
    objective: z.string().max(5000).optional(),
    assessment: z.string().max(5000).optional(),
    plan: z.string().max(5000).optional()
  })
  .strict();

/** The first task accepts only clinician-entered note fields, never chart context. */
export const noteFormattingRequestSchema = z
  .object({ sections: noteSectionsSchema })
  .strict()
  .refine((value) => Object.values(value.sections).some((text) => Boolean(text?.trim())), {
    message: 'Enter at least one note section before requesting formatting.'
  });
export type NoteFormattingRequest = z.infer<typeof noteFormattingRequestSchema>;

/** Future provider output is constrained to the same four editable note fields. */
export const noteFormattingResponseSchema = z
  .object({
    sections: z
      .object({
        subjective: z.string().max(5000),
        objective: z.string().max(5000),
        assessment: z.string().max(5000),
        plan: z.string().max(5000)
      })
      .strict(),
    source: z.literal('CLINICIAN_ENTERED_TEXT')
  })
  .strict();
export type NoteFormattingResponse = z.infer<typeof noteFormattingResponseSchema>;

export type NoteFormattingStatus = {
  task: 'NOTE_FORMATTING';
  enabled: boolean;
  available: false;
  reason: 'FEATURE_DISABLED' | 'PROVIDER_NOT_CONFIGURED';
};

async function assertEncounterInFacility(encounterId: string) {
  // The Prisma tenant extension scopes this lookup to the authenticated facility.
  const encounter = await prisma.encounter.findUnique({ where: { id: encounterId }, select: { id: true } });
  if (!encounter) throw new AppError('Encounter not found', 404, 'ENCOUNTER_NOT_FOUND');
}

export async function getNoteFormattingStatus(encounterId: string): Promise<NoteFormattingStatus> {
  await assertEncounterInFacility(encounterId);
  const enabled = env.CURATAAI_NOTE_FORMATTING_ENABLED;
  return {
    task: 'NOTE_FORMATTING',
    enabled,
    available: false,
    reason: enabled ? 'PROVIDER_NOT_CONFIGURED' : 'FEATURE_DISABLED'
  };
}

/**
 * Foundation only: records that a clinician tried the feature, but never sends
 * note text to a provider and never returns generated text. The feature flag is
 * false by default; even if switched on, this phase has no configured provider.
 */
export async function requestNoteFormatting(encounterId: string, payload: NoteFormattingRequest, req: Request): Promise<never> {
  await assertEncounterInFacility(encounterId);
  const inputChars = Object.values(payload.sections).reduce((total, text) => total + (text?.length ?? 0), 0);
  const enabled = env.CURATAAI_NOTE_FORMATTING_ENABLED;
  const reason = enabled ? 'PROVIDER_NOT_CONFIGURED' : 'FEATURE_DISABLED';

  await createAuditLog({
    ...getRequestAuditContext(req),
    action: 'CURATAAI_NOTE_FORMATTING_REQUESTED',
    module: 'Encounters',
    entityType: 'Encounter',
    entityId: encounterId,
    details: { task: 'NOTE_FORMATTING', inputChars, outcome: reason }
  });

  if (!enabled) {
    throw new AppError('CurataAI note formatting is disabled.', 503, 'CURATAAI_DISABLED');
  }
  throw new AppError('CurataAI has no configured note-formatting provider.', 503, 'CURATAAI_PROVIDER_NOT_CONFIGURED');
}
