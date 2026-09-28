/*
  Allergy safety net for prescribing and dispensing.

  A drug conflicts with a recorded allergy when either name contains the other
  (e.g. "Penicillin" / "Benzylpenicillin"), or when the allergy names a drug
  class listed below and the drug belongs to it (e.g. a penicillin allergy and
  amoxicillin). This catches common, dangerous cases; it is not a complete
  drug-allergy database, and the clinician's judgement still applies. A
  conflict blocks the action unless the user records an override reason.
*/

const CLASS_MEMBERS: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'ampicillin', 'cloxacillin', 'flucloxacillin', 'piperacillin', 'co-amoxiclav', 'augmentin', 'amoxiclav'],
  sulfonamide: ['sulfamethoxazole', 'co-trimoxazole', 'cotrimoxazole', 'septrin', 'sulfadoxine', 'sulfadiazine', 'sulfasalazine', 'fansidar'],
  cephalosporin: ['ceftriaxone', 'cefuroxime', 'cefalexin', 'cephalexin', 'cefixime', 'cefotaxime', 'ceftazidime', 'cefazolin', 'cefpodoxime'],
  nsaid: ['ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'acetylsalicylic', 'indomethacin', 'piroxicam', 'meloxicam', 'ketorolac'],
  quinolone: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'moxifloxacin', 'norfloxacin'],
  macrolide: ['erythromycin', 'azithromycin', 'clarithromycin'],
  tetracycline: ['tetracycline', 'doxycycline', 'minocycline'],
  opioid: ['morphine', 'codeine', 'tramadol', 'pethidine', 'fentanyl'],
  artemisinin: ['artemether', 'artesunate', 'dihydroartemisinin', 'arteether']
};

// Words an allergy entry may use for each class.
const CLASS_ALIASES: Record<string, string[]> = {
  penicillin: ['penicillin', 'penicillins'],
  sulfonamide: ['sulfa', 'sulpha', 'sulfonamide', 'sulfonamides', 'sulphonamide', 'sulphonamides'],
  cephalosporin: ['cephalosporin', 'cephalosporins'],
  nsaid: ['nsaid', 'nsaids'],
  quinolone: ['quinolone', 'quinolones', 'fluoroquinolone', 'fluoroquinolones'],
  macrolide: ['macrolide', 'macrolides'],
  tetracycline: ['tetracyclines'],
  opioid: ['opioid', 'opioids', 'opiate', 'opiates'],
  artemisinin: ['artemisinin', 'artemisinins', 'act']
};

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim();

function allergyClasses(substance: string): string[] {
  const words = new Set(normalise(substance).split(' '));
  return Object.entries(CLASS_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => words.has(alias)))
    .map(([cls]) => cls);
}

/** Recorded allergy substances that conflict with a drug, identified by its names. */
export function allergyConflicts(allergies: ReadonlyArray<{ substance: string }>, drugNames: ReadonlyArray<string | null | undefined>): string[] {
  const names = drugNames.filter((name): name is string => Boolean(name && name.trim())).map(normalise);
  if (!names.length) return [];
  const conflicts = new Set<string>();
  for (const allergy of allergies) {
    const substance = normalise(allergy.substance);
    if (substance.length < 3) continue;
    const direct = names.some((name) => name.includes(substance) || (name.length >= 4 && substance.includes(name)));
    const byClass = allergyClasses(allergy.substance).some((cls) => names.some((name) => CLASS_MEMBERS[cls].some((member) => name.includes(member))));
    if (direct || byClass) conflicts.add(allergy.substance);
  }
  return [...conflicts];
}
