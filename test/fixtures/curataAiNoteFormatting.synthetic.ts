/** Synthetic markers only. These are contract-test strings, not patient notes or clinical examples. */
export const syntheticNoteFormattingInputs = [
  {
    id: 'four-sections-with-quotes-negation-and-line-breaks',
    sections: {
      subjective: 'SYNTHETIC ONLY: "quote-marker"; NEGATION-marker=NOT_ALPHA.\nSecond line: marker-beta.',
      objective: 'SYNTHETIC ONLY: observation-marker-01; time-marker-T1.',
      assessment: 'SYNTHETIC ONLY: uncertainty-marker-maybe; no conclusion.',
      plan: 'SYNTHETIC ONLY: follow-up-marker-F1; no action.'
    }
  },
  {
    id: 'partial-sections-with-unicode-punctuation',
    sections: {
      subjective: 'SYNTHETIC ONLY: “quoted-marker” — newline follows.\nContinuation-marker.',
      plan: 'SYNTHETIC ONLY: plan-marker-β; punctuation?!'
    }
  },
  {
    id: 'exact-editor-section-limit',
    sections: { subjective: `SYNTHETIC:${'x'.repeat(4990)}` }
  }
] as const;
