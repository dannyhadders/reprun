-- Workout plans. body is the plan text itself (see shared/plan.ts), parsed when a routine is started.
CREATE TABLE routines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT (datetime('now'))
);
