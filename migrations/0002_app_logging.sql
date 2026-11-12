-- Workouts logged live in the app: real duration, and a phone-generated id so a retried upload never duplicates.
ALTER TABLE workouts ADD COLUMN duration_s INTEGER;
ALTER TABLE workouts ADD COLUMN client_id TEXT;
CREATE UNIQUE INDEX workouts_client_id ON workouts(client_id);
