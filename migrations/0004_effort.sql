-- How hard an exercise felt (1-10, RPE-style), rated once per exercise in the logger and kept on each of its sets.
-- Double progression holds the weight after a hard session instead of adding more (shared/plan.ts).
ALTER TABLE sets ADD COLUMN rpe INTEGER;
