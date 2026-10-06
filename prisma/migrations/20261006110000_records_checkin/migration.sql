-- Whether a visit is being billed to the patient's insurance.
--
-- The membership itself already lives on PatientInsurance. This is the separate
-- question of whether today's visit is going on the scheme or being paid for
-- directly, which is a decision made at the desk, one visit at a time: an
-- insured patient still pays cash for whatever their scheme excludes, and
-- Finance has to know which it was.
ALTER TABLE "PatientVisit" ADD COLUMN "insuranceUsed" BOOLEAN NOT NULL DEFAULT false;
