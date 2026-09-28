/*
  A curated list of ICD-10 (WHO) codes common in Ghanaian outpatient and
  emergency practice, for diagnosis search. It is not the full classification:
  clinicians may enter any code or a free-text diagnosis. A full ICD-10 import
  can replace this list later without changing the API.
*/

export type Icd10Entry = { code: string; description: string };

export const ICD10_COMMON: readonly Icd10Entry[] = [
  // Infectious and parasitic
  { code: 'A00.9', description: 'Cholera, unspecified' },
  { code: 'A01.0', description: 'Typhoid fever' },
  { code: 'A06.0', description: 'Acute amoebic dysentery' },
  { code: 'A09', description: 'Infectious gastroenteritis and colitis, unspecified' },
  { code: 'A15.0', description: 'Tuberculosis of lung' },
  { code: 'A16.9', description: 'Respiratory tuberculosis, unspecified' },
  { code: 'A39.0', description: 'Meningococcal meningitis' },
  { code: 'A41.9', description: 'Sepsis, unspecified organism' },
  { code: 'A53.9', description: 'Syphilis, unspecified' },
  { code: 'A54.9', description: 'Gonococcal infection, unspecified' },
  { code: 'A59.0', description: 'Urogenital trichomoniasis' },
  { code: 'A90', description: 'Dengue fever' },
  { code: 'B01.9', description: 'Varicella (chickenpox) without complication' },
  { code: 'B05.9', description: 'Measles without complication' },
  { code: 'B15.9', description: 'Hepatitis A without hepatic coma' },
  { code: 'B16.9', description: 'Acute hepatitis B without delta agent and without hepatic coma' },
  { code: 'B18.1', description: 'Chronic viral hepatitis B without delta agent' },
  { code: 'B18.2', description: 'Chronic viral hepatitis C' },
  { code: 'B20', description: 'HIV disease resulting in infectious and parasitic diseases' },
  { code: 'B24', description: 'Unspecified HIV disease' },
  { code: 'B35.4', description: 'Tinea corporis' },
  { code: 'B37.3', description: 'Candidiasis of vulva and vagina' },
  { code: 'B50.9', description: 'Plasmodium falciparum malaria, unspecified' },
  { code: 'B50.0', description: 'Plasmodium falciparum malaria with cerebral complications' },
  { code: 'B54', description: 'Unspecified malaria' },
  { code: 'B65.9', description: 'Schistosomiasis, unspecified' },
  { code: 'B77.9', description: 'Ascariasis, unspecified' },
  { code: 'B82.9', description: 'Intestinal parasitism, unspecified' },
  { code: 'B86', description: 'Scabies' },
  { code: 'U07.1', description: 'COVID-19, virus identified' },

  // Blood and nutrition
  { code: 'D50.9', description: 'Iron deficiency anaemia, unspecified' },
  { code: 'D57.1', description: 'Sickle-cell disease without crisis' },
  { code: 'D57.0', description: 'Sickle-cell anaemia with crisis' },
  { code: 'D64.9', description: 'Anaemia, unspecified' },
  { code: 'E40', description: 'Kwashiorkor' },
  { code: 'E43', description: 'Unspecified severe protein-energy malnutrition' },
  { code: 'E44.0', description: 'Moderate protein-energy malnutrition' },
  { code: 'E66.9', description: 'Obesity, unspecified' },
  { code: 'E86', description: 'Volume depletion (dehydration)' },
  { code: 'E87.1', description: 'Hypo-osmolality and hyponatraemia' },

  // Endocrine
  { code: 'E03.9', description: 'Hypothyroidism, unspecified' },
  { code: 'E05.9', description: 'Thyrotoxicosis, unspecified' },
  { code: 'E10.9', description: 'Type 1 diabetes mellitus without complications' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  { code: 'E11.6', description: 'Type 2 diabetes mellitus with other specified complications' },
  { code: 'E11.0', description: 'Type 2 diabetes mellitus with hyperosmolarity' },
  { code: 'E16.2', description: 'Hypoglycaemia, unspecified' },
  { code: 'E78.5', description: 'Hyperlipidaemia, unspecified' },

  // Mental and neurological
  { code: 'F10.2', description: 'Alcohol dependence syndrome' },
  { code: 'F20.9', description: 'Schizophrenia, unspecified' },
  { code: 'F32.9', description: 'Depressive episode, unspecified' },
  { code: 'F41.1', description: 'Generalized anxiety disorder' },
  { code: 'G03.9', description: 'Meningitis, unspecified' },
  { code: 'G40.9', description: 'Epilepsy, unspecified' },
  { code: 'G43.9', description: 'Migraine, unspecified' },
  { code: 'G44.2', description: 'Tension-type headache' },
  { code: 'R51', description: 'Headache' },

  // Eye and ear
  { code: 'H10.9', description: 'Conjunctivitis, unspecified' },
  { code: 'H26.9', description: 'Cataract, unspecified' },
  { code: 'H40.9', description: 'Glaucoma, unspecified' },
  { code: 'H52.4', description: 'Presbyopia' },
  { code: 'H66.9', description: 'Otitis media, unspecified' },
  { code: 'H60.9', description: 'Otitis externa, unspecified' },

  // Circulatory
  { code: 'I10', description: 'Essential (primary) hypertension' },
  { code: 'I11.9', description: 'Hypertensive heart disease without heart failure' },
  { code: 'I20.9', description: 'Angina pectoris, unspecified' },
  { code: 'I21.9', description: 'Acute myocardial infarction, unspecified' },
  { code: 'I50.9', description: 'Heart failure, unspecified' },
  { code: 'I63.9', description: 'Cerebral infarction, unspecified' },
  { code: 'I64', description: 'Stroke, not specified as haemorrhage or infarction' },
  { code: 'I83.9', description: 'Varicose veins of lower extremities without ulcer or inflammation' },
  { code: 'I84.9', description: 'Haemorrhoids without complication' },

  // Respiratory
  { code: 'J00', description: 'Acute nasopharyngitis (common cold)' },
  { code: 'J02.9', description: 'Acute pharyngitis, unspecified' },
  { code: 'J03.9', description: 'Acute tonsillitis, unspecified' },
  { code: 'J01.9', description: 'Acute sinusitis, unspecified' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
  { code: 'J11.1', description: 'Influenza with other respiratory manifestations, virus not identified' },
  { code: 'J18.9', description: 'Pneumonia, unspecified' },
  { code: 'J20.9', description: 'Acute bronchitis, unspecified' },
  { code: 'J30.4', description: 'Allergic rhinitis, unspecified' },
  { code: 'J44.9', description: 'Chronic obstructive pulmonary disease, unspecified' },
  { code: 'J45.9', description: 'Asthma, unspecified' },

  // Digestive
  { code: 'K02.9', description: 'Dental caries, unspecified' },
  { code: 'K04.7', description: 'Periapical abscess without sinus' },
  { code: 'K21.9', description: 'Gastro-oesophageal reflux disease without oesophagitis' },
  { code: 'K27.9', description: 'Peptic ulcer, unspecified' },
  { code: 'K29.7', description: 'Gastritis, unspecified' },
  { code: 'K30', description: 'Dyspepsia' },
  { code: 'K35.8', description: 'Acute appendicitis, other and unspecified' },
  { code: 'K40.9', description: 'Unilateral or unspecified inguinal hernia, without obstruction or gangrene' },
  { code: 'K52.9', description: 'Noninfective gastroenteritis and colitis, unspecified' },
  { code: 'K59.0', description: 'Constipation' },
  { code: 'K74.6', description: 'Other and unspecified cirrhosis of liver' },
  { code: 'K80.2', description: 'Calculus of gallbladder without cholecystitis' },

  // Skin
  { code: 'L02.9', description: 'Cutaneous abscess, furuncle and carbuncle, unspecified' },
  { code: 'L03.9', description: 'Cellulitis, unspecified' },
  { code: 'L20.9', description: 'Atopic dermatitis, unspecified' },
  { code: 'L30.9', description: 'Dermatitis, unspecified' },
  { code: 'L50.9', description: 'Urticaria, unspecified' },
  { code: 'L70.0', description: 'Acne vulgaris' },

  // Musculoskeletal
  { code: 'M06.9', description: 'Rheumatoid arthritis, unspecified' },
  { code: 'M10.9', description: 'Gout, unspecified' },
  { code: 'M17.9', description: 'Gonarthrosis (knee osteoarthritis), unspecified' },
  { code: 'M54.5', description: 'Low back pain' },
  { code: 'M79.1', description: 'Myalgia' },

  // Genitourinary
  { code: 'N18.9', description: 'Chronic kidney disease, unspecified' },
  { code: 'N20.0', description: 'Calculus of kidney' },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified' },
  { code: 'N40', description: 'Hyperplasia of prostate' },
  { code: 'N73.9', description: 'Female pelvic inflammatory disease, unspecified' },
  { code: 'N76.0', description: 'Acute vaginitis' },
  { code: 'N94.6', description: 'Dysmenorrhoea, unspecified' },
  { code: 'N97.9', description: 'Female infertility, unspecified' },

  // Pregnancy
  { code: 'O13', description: 'Gestational hypertension without significant proteinuria' },
  { code: 'O14.9', description: 'Pre-eclampsia, unspecified' },
  { code: 'O21.0', description: 'Mild hyperemesis gravidarum' },
  { code: 'O24.4', description: 'Diabetes mellitus arising in pregnancy' },
  { code: 'O99.0', description: 'Anaemia complicating pregnancy, childbirth and the puerperium' },
  { code: 'Z34.9', description: 'Supervision of normal pregnancy, unspecified' },

  // Symptoms and signs
  { code: 'R05', description: 'Cough' },
  { code: 'R10.4', description: 'Other and unspecified abdominal pain' },
  { code: 'R11', description: 'Nausea and vomiting' },
  { code: 'R50.9', description: 'Fever, unspecified' },
  { code: 'R53', description: 'Malaise and fatigue' },
  { code: 'R56.0', description: 'Febrile convulsions' },
  { code: 'R07.4', description: 'Chest pain, unspecified' },

  // Injury and poisoning
  { code: 'S06.0', description: 'Concussion' },
  { code: 'S52.5', description: 'Fracture of lower end of radius' },
  { code: 'S93.4', description: 'Sprain and strain of ankle' },
  { code: 'T14.1', description: 'Open wound of unspecified body region' },
  { code: 'T30.0', description: 'Burn of unspecified body region, unspecified degree' },
  { code: 'T63.0', description: 'Toxic effect of snake venom' },
  { code: 'W54', description: 'Bitten or struck by dog' },
  { code: 'V89.2', description: 'Person injured in unspecified motor-vehicle accident, traffic' },

  // Health services
  { code: 'Z00.0', description: 'General medical examination' },
  { code: 'Z23', description: 'Need for immunization against single bacterial diseases' },
  { code: 'Z30.0', description: 'General counselling and advice on contraception' },
  { code: 'Z71.1', description: 'Person with feared complaint in whom no diagnosis is made' }
];

/** Case-insensitive search by code prefix or words in the description. */
export function searchIcd10(query: string, limit = 20): Icd10Entry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICD10_COMMON.slice(0, limit);
  const words = q.split(/\s+/);
  return ICD10_COMMON.filter((entry) => {
    if (entry.code.toLowerCase().startsWith(q)) return true;
    const text = entry.description.toLowerCase();
    return words.every((word) => text.includes(word));
  }).slice(0, limit);
}
