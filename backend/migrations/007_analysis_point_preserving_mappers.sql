-- Mapper UDFs preserve the complete NumericPoint. The four seeded system
-- mappers are rewritten idempotently because installations may have applied
-- earlier migrations before the point-returning contract was introduced.
UPDATE analysis_function_revisions revision
SET
  source_body = CASE function_row.function_key
    WHEN 'identity' THEN 'return point;'
    WHEN 'replace_null_with_zero' THEN 'return point.withValue(value ?? 0);'
    WHEN 'clamp' THEN 'if (value === null) return point; const min = options.min ?? -Infinity; const max = options.max ?? Infinity; return point.withValue(Math.min(max, Math.max(min, value)));'
    WHEN 'scale' THEN 'return value === null ? point : point.withValue(value * (options.factor ?? 1));'
    ELSE revision.source_body
  END,
  output_metadata = jsonb_set(
    COALESCE(revision.output_metadata, '{}'::jsonb),
    '{mapperContract}',
    '"value-point-to-point-v5"'::jsonb,
    true
  ),
  source_hash = 'point-preserving-v5-' || function_row.function_key,
  validation_status = 'passed',
  validated_at = now()
FROM analysis_functions function_row
WHERE revision.function_id = function_row.id
  AND function_row.is_system = true
  AND function_row.function_kind = 'point-map'
  AND function_row.function_key IN ('identity', 'replace_null_with_zero', 'clamp', 'scale');

-- Record the canonical contract for all mapper revisions. User-authored legacy
-- numeric-returning revisions remain stored for auditability, but must be edited
-- to return point.withValue(...) before a new revision can validate or publish.
UPDATE analysis_function_revisions revision
SET output_metadata = jsonb_set(
  COALESCE(revision.output_metadata, '{}'::jsonb),
  '{mapperContract}',
  '"value-point-to-point-v5"'::jsonb,
  true
)
FROM analysis_functions function_row
WHERE revision.function_id = function_row.id
  AND function_row.function_kind = 'point-map'
  AND NOT (COALESCE(revision.output_metadata, '{}'::jsonb) ? 'mapperContract');
