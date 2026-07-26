CREATE TABLE analysis_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  editor_mode TEXT NOT NULL CHECK (editor_mode IN ('pipeline', 'code')),
  draft_revision_id UUID,
  published_revision_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(name) BETWEEN 1 AND 200)
);

CREATE TABLE analysis_program_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES analysis_programs(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  sdk_version INTEGER NOT NULL DEFAULT 1,
  pipeline_registry_version INTEGER NOT NULL DEFAULT 1,
  source_body TEXT NOT NULL,
  pipeline_definition JSONB,
  default_range TEXT NOT NULL DEFAULT '2d',
  output_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('pending', 'passed', 'failed', 'syntax-error')),
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, revision),
  CHECK (char_length(source_body) <= 100000)
);

CREATE TABLE analysis_program_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES analysis_program_revisions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  alias TEXT NOT NULL CHECK (alias ~ '^[A-Za-z_$][A-Za-z0-9_$]*$'),
  event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT,
  display_unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
  rows_before INTEGER NOT NULL DEFAULT 0 CHECK (rows_before BETWEEN 0 AND 10000),
  rows_after INTEGER NOT NULL DEFAULT 0 CHECK (rows_after BETWEEN 0 AND 10000),
  context_is_explicit BOOLEAN NOT NULL DEFAULT false,
  include_ongoing BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (revision_id, alias),
  UNIQUE (revision_id, position)
);

CREATE TABLE analysis_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_key TEXT NOT NULL UNIQUE CHECK (function_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  name TEXT NOT NULL,
  description TEXT,
  function_kind TEXT NOT NULL CHECK (function_kind IN ('event-filter','point-map','point-filter','map-filter','window-transform','reducer','series-transform')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  draft_revision_id UUID,
  published_revision_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE analysis_function_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id UUID NOT NULL REFERENCES analysis_functions(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  sdk_version INTEGER NOT NULL DEFAULT 1,
  source_body TEXT NOT NULL,
  parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hash TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('pending', 'passed', 'failed', 'syntax-error')),
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (function_id, revision),
  CHECK (char_length(source_body) <= 100000)
);

CREATE TABLE analysis_program_function_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_revision_id UUID NOT NULL REFERENCES analysis_program_revisions(id) ON DELETE CASCADE,
  function_revision_id UUID NOT NULL REFERENCES analysis_function_revisions(id) ON DELETE RESTRICT,
  alias TEXT NOT NULL CHECK (alias ~ '^[A-Za-z_$][A-Za-z0-9_$]*$'),
  position INTEGER NOT NULL,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (program_revision_id, alias),
  UNIQUE (program_revision_id, position)
);

CREATE TABLE explorations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES analysis_programs(id) ON DELETE CASCADE,
  auto_run BOOLEAN NOT NULL DEFAULT true,
  editor_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE analysis_programs
  ADD CONSTRAINT analysis_programs_draft_revision_fk FOREIGN KEY (draft_revision_id) REFERENCES analysis_program_revisions(id) ON DELETE SET NULL,
  ADD CONSTRAINT analysis_programs_published_revision_fk FOREIGN KEY (published_revision_id) REFERENCES analysis_program_revisions(id) ON DELETE SET NULL;
ALTER TABLE analysis_functions
  ADD CONSTRAINT analysis_functions_draft_revision_fk FOREIGN KEY (draft_revision_id) REFERENCES analysis_function_revisions(id) ON DELETE SET NULL,
  ADD CONSTRAINT analysis_functions_published_revision_fk FOREIGN KEY (published_revision_id) REFERENCES analysis_function_revisions(id) ON DELETE SET NULL;

CREATE INDEX analysis_program_revisions_program_idx ON analysis_program_revisions(program_id, revision DESC);
CREATE INDEX analysis_program_inputs_event_type_idx ON analysis_program_inputs(event_type_id);
CREATE INDEX analysis_function_revisions_function_idx ON analysis_function_revisions(function_id, revision DESC);
CREATE INDEX explorations_program_idx ON explorations(program_id);

CREATE TRIGGER analysis_programs_set_updated_at BEFORE UPDATE ON analysis_programs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER analysis_functions_set_updated_at BEFORE UPDATE ON analysis_functions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER explorations_set_updated_at BEFORE UPDATE ON explorations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Built-ins use the same immutable revision path as user-authored functions.
WITH inserted AS (
  INSERT INTO analysis_functions(function_key, name, description, function_kind, is_system)
  VALUES
    ('identity', 'Identity', 'Return the input value unchanged.', 'point-map', true),
    ('replace-null-with-zero', 'Replace null with zero', 'Replace null values while preserving numeric zero.', 'point-map', true),
    ('clamp', 'Clamp', 'Clamp finite values to options.min and options.max.', 'point-map', true),
    ('scale', 'Scale', 'Multiply finite values by options.factor.', 'point-map', true),
    ('positive-only', 'Positive only', 'Keep positive finite values.', 'point-filter', true),
    ('non-null-only', 'Non-null only', 'Keep non-null values.', 'point-filter', true),
    ('normalize-and-drop-invalid', 'Normalize and drop invalid', 'Drop non-finite/null values and scale retained values.', 'map-filter', true),
    ('trailing-mean', 'Trailing mean', 'Mean of valid values in a window.', 'window-transform', true),
    ('trailing-median', 'Trailing median', 'Median of valid values in a window.', 'window-transform', true),
    ('sum', 'Sum', 'Sum all non-null visible values.', 'reducer', true),
    ('mean', 'Mean', 'Mean of all non-null visible values.', 'reducer', true),
    ('median', 'Median', 'Median of all non-null visible values.', 'reducer', true),
    ('minimum', 'Minimum', 'Minimum non-null visible value.', 'reducer', true),
    ('maximum', 'Maximum', 'Maximum non-null visible value.', 'reducer', true),
    ('latest-non-null', 'Latest non-null', 'Return the latest non-null visible value.', 'reducer', true)
  RETURNING id, function_key
), revisions AS (
  INSERT INTO analysis_function_revisions(function_id, revision, source_body, parameter_schema, default_options, source_hash, validation_status, validation_report, validated_at)
  SELECT id, 1,
    CASE function_key
      WHEN 'identity' THEN 'return value;'
      WHEN 'replace-null-with-zero' THEN 'return value ?? 0;'
      WHEN 'clamp' THEN 'if (value === null) return null; const min = options.min ?? -Infinity; const max = options.max ?? Infinity; return Math.min(max, Math.max(min, value));'
      WHEN 'scale' THEN 'return value === null ? null : value * (options.factor ?? 1);'
      WHEN 'positive-only' THEN 'return value !== null && Number.isFinite(value) && value > 0;'
      WHEN 'non-null-only' THEN 'return value !== null;'
      WHEN 'normalize-and-drop-invalid' THEN 'if (value === null || !Number.isFinite(value)) return MapFilterResult.drop(); return MapFilterResult.keep(value * (options.factor ?? 1));'
      WHEN 'trailing-mean' THEN 'const valid = window.validValues(); return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;'
      WHEN 'trailing-median' THEN 'const valid = [...window.validValues()].sort((a,b) => a-b); if (!valid.length) return null; const middle = Math.floor(valid.length / 2); return valid.length % 2 ? valid[middle]! : (valid[middle - 1]! + valid[middle]!) / 2;'
      WHEN 'sum' THEN 'return values.filter((value) => value !== null).reduce((total, value) => total + value, 0);'
      WHEN 'mean' THEN 'const valid = values.filter((value) => value !== null); return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;'
      WHEN 'median' THEN 'const valid = values.filter((value) => value !== null).sort((a,b) => a-b); if (!valid.length) return null; const middle = Math.floor(valid.length / 2); return valid.length % 2 ? valid[middle]! : (valid[middle - 1]! + valid[middle]!) / 2;'
      WHEN 'minimum' THEN 'const valid = values.filter((value) => value !== null); return valid.length ? Math.min(...valid) : null;'
      WHEN 'maximum' THEN 'const valid = values.filter((value) => value !== null); return valid.length ? Math.max(...valid) : null;'
      ELSE 'for (let index = points.length - 1; index >= 0; index -= 1) { const point = points[index]; if (point?.value !== null && point?.value !== undefined) return point.value; } return null;'
    END,
    CASE function_key
      WHEN 'clamp' THEN '{"type":"object","properties":{"min":{"type":"number"},"max":{"type":"number"}},"additionalProperties":false}'::jsonb
      WHEN 'scale' THEN '{"type":"object","properties":{"factor":{"type":"number"}},"additionalProperties":false}'::jsonb
      WHEN 'normalize-and-drop-invalid' THEN '{"type":"object","properties":{"factor":{"type":"number"}},"additionalProperties":false}'::jsonb
      ELSE '{}'::jsonb
    END,
    CASE function_key
      WHEN 'scale' THEN '{"factor":1}'::jsonb
      WHEN 'normalize-and-drop-invalid' THEN '{"factor":1}'::jsonb
      ELSE '{}'::jsonb
    END,
    'builtin-v1-' || function_key,
    'passed',
    '{"schemaVersion":1,"status":"passed","fixtures":[],"systemSeed":true}'::jsonb,
    now()
  FROM inserted RETURNING id, function_id
)
UPDATE analysis_functions f SET draft_revision_id = r.id, published_revision_id = r.id FROM revisions r WHERE f.id = r.function_id;
