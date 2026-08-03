-- Configurable UDFs are typed factories. Configuration belongs in explicit,
-- editor-visible parameters and is captured by the returned callback instead
-- of flowing through the untyped AnalysisOptions bag.
--
-- Create new immutable revisions for the configurable system functions rather
-- than rewriting an existing published revision in place.
WITH targets AS (
  SELECT
    function_row.id AS function_id,
    function_row.function_key,
    COALESCE(MAX(revision.revision), 0) + 1 AS next_revision
  FROM analysis_functions function_row
  LEFT JOIN analysis_function_revisions revision
    ON revision.function_id = function_row.id
  WHERE function_row.is_system = true
    AND function_row.function_key IN ('clamp', 'scale', 'normalize_and_drop_invalid')
    AND NOT EXISTS (
      SELECT 1
      FROM analysis_function_revisions existing
      WHERE existing.function_id = function_row.id
        AND existing.output_metadata->>'configurationContract' = 'typed-factory-v1'
    )
  GROUP BY function_row.id, function_row.function_key
), inserted AS (
  INSERT INTO analysis_function_revisions(
    function_id,
    revision,
    sdk_version,
    source_body,
    parameter_schema,
    default_options,
    output_metadata,
    source_hash,
    validation_status,
    validation_report,
    validated_at
  )
  SELECT
    target.function_id,
    target.next_revision,
    1,
    CASE target.function_key
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
      ELSE $normalize$
function normalize_and_drop_invalid(factor: number): NumericMapFilter {
  if (!Number.isFinite(factor)) {
    throw new Error('normalization factor must be a finite number');
  }
  return (value, point, index, context): NumericPoint | null => {
    void index;
    void context;
    return value === null || !Number.isFinite(value)
      ? null
      : point.withValue(value * factor);
  };
}
$normalize$
    END,
    CASE target.function_key
      WHEN 'clamp' THEN '{"type":"array","prefixItems":[{"type":"number","title":"min"},{"type":"number","title":"max"}],"minItems":2,"maxItems":2}'::jsonb
      ELSE jsonb_build_object(
        'type', 'array',
        'prefixItems', jsonb_build_array(jsonb_build_object('type', 'number', 'title', 'factor')),
        'minItems', 1,
        'maxItems', 1
      )
    END,
    '{}'::jsonb,
    jsonb_build_object(
      'inferredFunctionKind', CASE
        WHEN target.function_key = 'normalize_and_drop_invalid' THEN 'map-filter'
        ELSE 'point-map'
      END,
      'inferredFunctionMode', 'factory',
      'configurationContract', 'typed-factory-v1'
    ),
    'typed-factory-v1-' || target.function_key,
    'passed',
    '{"schemaVersion":1,"status":"passed","fixtures":[],"systemSeed":true,"configurationContract":"typed-factory-v1"}'::jsonb,
    now()
  FROM targets target
  RETURNING id, function_id
)
UPDATE analysis_functions function_row
SET
  draft_revision_id = inserted.id,
  published_revision_id = inserted.id
FROM inserted
WHERE function_row.id = inserted.function_id;

UPDATE analysis_functions
SET description = CASE function_key
  WHEN 'clamp' THEN 'Create a point mapper that clamps finite values between typed min and max parameters.'
  WHEN 'scale' THEN 'Create a point mapper that multiplies finite values by a typed factor parameter.'
  WHEN 'normalize_and_drop_invalid' THEN 'Create a map/filter that drops invalid values and scales retained points by a typed factor parameter.'
  ELSE description
END
WHERE is_system = true
  AND function_key IN ('clamp', 'scale', 'normalize_and_drop_invalid');
