-- Normalize reusable-function keys and align saved point mappers with the point-oriented API.
ALTER TABLE analysis_functions
  DROP CONSTRAINT IF EXISTS analysis_functions_function_key_check;

DO $$
DECLARE
  item RECORD;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR item IN
    SELECT id, function_key
    FROM analysis_functions
    WHERE function_key LIKE '%-%'
    ORDER BY is_system DESC, created_at, id
  LOOP
    candidate := replace(item.function_key, '-', '_');
    suffix := 2;
    WHILE EXISTS (
      SELECT 1 FROM analysis_functions
      WHERE function_key = candidate AND id <> item.id
    ) LOOP
      candidate := left(replace(item.function_key, '-', '_'), 63 - length(suffix::text)) || '_' || suffix::text;
      suffix := suffix + 1;
    END LOOP;
    UPDATE analysis_functions SET function_key = candidate WHERE id = item.id;
  END LOOP;
END $$;

ALTER TABLE analysis_functions
  ADD CONSTRAINT analysis_functions_function_key_check
  CHECK (function_key ~ '^[a-z][a-z0-9_]{0,63}$');

-- System point mappers now return immutable NumericPoint values for point-returning NumericSeries.map().
UPDATE analysis_function_revisions revision
SET
  source_body = CASE function_row.function_key
    WHEN 'identity' THEN 'return point;'
    WHEN 'replace_null_with_zero' THEN 'return point.withValue(point.value ?? 0);'
    WHEN 'clamp' THEN 'if (point.value === null) return point; const min = options.min ?? -Infinity; const max = options.max ?? Infinity; return point.withValue(Math.min(max, Math.max(min, point.value)));'
    WHEN 'scale' THEN 'return point.value === null ? point : point.withValue(point.value * (options.factor ?? 1));'
    ELSE revision.source_body
  END,
  source_hash = 'builtin-v2-' || function_row.function_key,
  validation_status = 'passed',
  validation_report = jsonb_set(
    COALESCE(revision.validation_report, '{}'::jsonb),
    '{udfApi}',
    '"point-oriented-v2"'::jsonb,
    true
  ),
  validated_at = now()
FROM analysis_functions function_row
WHERE revision.function_id = function_row.id
  AND function_row.is_system = true
  AND function_row.function_kind = 'point-map'
  AND function_row.function_key IN ('identity', 'replace_null_with_zero', 'clamp', 'scale');
