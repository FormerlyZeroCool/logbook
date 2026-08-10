-- NumericSeries.map now infers value-map versus point-map behavior from the
-- callback return type. Canonical saved point mappers receive both the nullable
-- value and immutable point so they can replace nulls while preserving metadata.
-- Body-only revisions automatically use the new generated signature. Rewrite
-- complete legacy point-first declarations so published revisions keep working.
UPDATE analysis_function_revisions revision
SET
  source_body = regexp_replace(
    revision.source_body,
    '^([[:space:]]*function[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*\([[:space:]]*)(point[[:space:]]*:[[:space:]]*NumericPoint[[:space:]]*,)',
    E'\\1value: number | null,\n  \\2'
  ),
  output_metadata = jsonb_set(
    COALESCE(revision.output_metadata, '{}'::jsonb),
    '{mapperContract}',
    '"value-point-to-point-v4"'::jsonb,
    true
  ),
  source_hash = 'point-map-v4-' || revision.id::text,
  validation_status = 'passed',
  validated_at = now()
FROM analysis_functions function_row
WHERE revision.function_id = function_row.id
  AND function_row.function_kind = 'point-map'
  AND revision.source_body ~ '^[[:space:]]*function[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*\([[:space:]]*point[[:space:]]*:[[:space:]]*NumericPoint[[:space:]]*,';

-- Record the new contract for body-only point mappers as well.
UPDATE analysis_function_revisions revision
SET output_metadata = jsonb_set(
  COALESCE(revision.output_metadata, '{}'::jsonb),
  '{mapperContract}',
  '"value-point-to-point-v4"'::jsonb,
  true
)
FROM analysis_functions function_row
WHERE revision.function_id = function_row.id
  AND function_row.function_kind = 'point-map'
  AND NOT (COALESCE(revision.output_metadata, '{}'::jsonb) ? 'mapperContract');
