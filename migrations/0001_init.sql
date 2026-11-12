-- muscle: chest | back | shoulders | arms | legs | core | other
-- lift: bench | squat | deadlift | ohp, for exercises with published strength standards
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  muscle TEXT NOT NULL DEFAULT 'other',
  lift TEXT
);

-- source: sheet | manual | app
CREATE TABLE workouts (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX workouts_date ON workouts(date);

CREATE TABLE sets (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL,
  weight_kg REAL,
  reps REAL,
  seconds REAL,
  notes TEXT
);
CREATE INDEX sets_workout ON sets(workout_id);

-- Runs, rides, and timed gym sessions. source: strava | sheet | manual.
-- external_id makes imports idempotent (Strava activity id, or a key built from sheet rows).
-- sample = 1 marks generated demo data so it can be wiped in one go.
CREATE TABLE activities (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  start TEXT,
  sport TEXT NOT NULL,
  name TEXT,
  distance_m REAL,
  moving_s INTEGER,
  elapsed_s INTEGER,
  elevation_m REAL,
  avg_hr REAL,
  notes TEXT,
  source TEXT NOT NULL,
  external_id TEXT UNIQUE,
  sample INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX activities_date ON activities(date);

-- Lifetime records and benchmarks as reported (e.g. "10K 54:23", "Ironman 70.3 6:44").
CREATE TABLE records (
  id INTEGER PRIMARY KEY,
  category TEXT,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  date TEXT,
  context TEXT,
  source TEXT NOT NULL
);

CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  exercise TEXT NOT NULL,
  latest TEXT,
  target TEXT NOT NULL,
  context TEXT,
  source TEXT NOT NULL
);

CREATE TABLE body_weight (
  date TEXT PRIMARY KEY,
  kg REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual'
);

-- profile (age, sex, body weight for strength standards), strava tokens, etc.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
