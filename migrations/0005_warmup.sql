-- Warm-up sets: saved (so an export or an AI review can see how you warmed up) but left out of PBs, 1RM, volume,
-- set counts, charts and progression (src/lib/stats.ts). 1 = warm-up; null or 0 = a working set.
ALTER TABLE sets ADD COLUMN warmup INTEGER;
