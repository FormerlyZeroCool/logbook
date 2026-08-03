-- Mapper UDFs use one canonical contract:
--   (value, point, index, context) => NumericPoint
-- or a typed factory returning NumericMapper.
--
-- Earlier development migrations created temporary system revisions with
-- number-returning bodies, point-first parameters, or AnalysisOptions bags.
-- There are no user-authored legacy mappers to preserve, so canonicalize every
-- system mapper revision in place and reject any remaining obsolete revision.
UPDATE analysis_function_revisions revision
SET
  source_body = CASE function_row.function_key
    WHEN 'identity' THEN $identity$
function identity(
  value: number | null,
  point: NumericPoint,
  index: number,
  context: AnalysisContext,
): NumericPoint {
  void value;
  void index;
  void context;
  return point;
}
$identity$
    WHEN 'replace_null_with_zero' THEN $replace$
function replace_null_with_zero(
  value: number | null,
  point: NumericPoint,
  index: number,
  context: AnalysisContext,
): NumericPoint {
  void index;
  void context;
  return point.withValue(value ?? 0);
}
$replace$
    WHEN 'clamp' THEN $clamp$
function clamp(min: number, max: number): NumericMapper {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('clamp bounds must be finite numbers');
  }
  if (min > max) {
    throw new Error('clamp min must be less than or equal to max');
  }
  return (value, point, index, context): NumericPoint => {
    void index;
    void context;
    return value === null
      ? point
      : point.withValue(Math.min(max, Math.max(min, value)));
  };
}
$clamp$
    WHEN 'scale' THEN $scale$
function scale(factor: number): NumericMapper {
  if (!Number.isFinite(factor)) {
    throw new Error('scale factor must be a finite number');
  }
  return (value, point, index, context): NumericPoint => {
    void index;
    void context;
    return value === null ? point : point.withValue(value * factor);
  };
}
$scale$
    ELSE revision.source_body
  END,
  parameter_schema = CASE function_row.function_key
    WHEN 'clamp' THEN '{"type":"array","prefixItems":[{"type":"number","title":"min"},{"type":"number","title":"max"}],"minItems":2,"maxItems":2}'::jsonb
    WHEN 'scale' THEN '{"type":"array","prefixItems":[{"type":"number","title":"factor"}],"minItems":1,"maxItems":1}'::jsonb
    ELSE '{}'::jsonb
  END,
  default_options = '{}'::jsonb,
  output_metadata = CASE
    WHEN function_row.function_key IN ('clamp', 'scale') THEN
      (COALESCE(revision.output_metadata, '{}'::jsonb) - 'legacyOptions')
      || jsonb_build_object(
        'inferredFunctionKind', 'point-map',
        'inferredFunctionMode', 'factory',
        'mapperContract', 'value-point-to-point-v6',
        'configurationContract', 'typed-factory-v1'
      )
    ELSE
      (COALESCE(revision.output_metadata, '{}'::jsonb) - 'legacyOptions' - 'configurationContract')
      || jsonb_build_object(
        'inferredFunctionKind', 'point-map',
        'inferredFunctionMode', 'direct',
        'mapperContract', 'value-point-to-point-v6'
      )
  END,
  source_hash = 'canonical-mapper-v6-' || function_row.function_key || '-' || revision.id::text,
  validation_status = 'passed',
  validation_report = jsonb_build_object(
    'schemaVersion', 1,
    'status', 'passed',
    'fixtures', '[]'::jsonb,
    'systemSeed', true,
    'mapperContract', 'value-point-to-point-v6'
  ),
  validated_at = now()
FROM analysis_functions function_row
WHERE revision.function_id = function_row.id
  AND function_row.is_system = true
  AND function_row.function_kind = 'point-map'
  AND function_row.function_key IN ('identity', 'replace_null_with_zero', 'clamp', 'scale');

DO $$
DECLARE
  legacy_mapper_count integer;
  legacy_mapper_keys text;
BEGIN
  SELECT
    COUNT(DISTINCT revision.id),
    string_agg(DISTINCT function_row.function_key, ', ' ORDER BY function_row.function_key)
  INTO legacy_mapper_count, legacy_mapper_keys
  FROM analysis_functions function_row
  JOIN analysis_function_revisions revision
    ON revision.function_id = function_row.id
  WHERE function_row.function_kind = 'point-map'
    AND (
      revision.output_metadata->>'inferredFunctionMode' = 'legacy-direct'
      OR revision.source_body ~ '^[[:space:]]*function[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*\([[:space:]]*point[[:space:]]*:[[:space:]]*NumericPoint'
      OR revision.source_body ~ '^[[:space:]]*function[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*\([^)]*options[[:space:]]*:[[:space:]]*AnalysisOptions'
      OR (
        revision.source_body !~ '^[[:space:]]*function[[:space:]]+'
        AND (
          revision.source_body ~ '(^|[^A-Za-z0-9_])options([^A-Za-z0-9_]|$)'
          OR revision.source_body !~ '(^|[^A-Za-z0-9_])point([^A-Za-z0-9_]|$)'
        )
      )
    );

  IF legacy_mapper_count > 0 THEN
    RAISE EXCEPTION
      'Saved mapper revisions still use obsolete point-first, number-returning, or AnalysisOptions contracts: %',
      COALESCE(legacy_mapper_keys, '(unknown)');
  END IF;
END
$$;
