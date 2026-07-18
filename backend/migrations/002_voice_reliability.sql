ALTER TABLE event_types
  ADD COLUMN IF NOT EXISTS voice_aliases TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS idempotency_requests (
  key TEXT PRIMARY KEY,
  request_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  CONSTRAINT idempotency_key_length CHECK (char_length(key) BETWEEN 1 AND 200),
  CONSTRAINT idempotency_status_valid CHECK (status_code IS NULL OR status_code BETWEEN 100 AND 599),
  CONSTRAINT idempotency_completion_shape CHECK (
    (completed_at IS NULL AND status_code IS NULL)
    OR
    (completed_at IS NOT NULL AND status_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idempotency_requests_expires_idx
  ON idempotency_requests (expires_at);

CREATE INDEX IF NOT EXISTS event_types_voice_aliases_idx
  ON event_types USING GIN (voice_aliases);
