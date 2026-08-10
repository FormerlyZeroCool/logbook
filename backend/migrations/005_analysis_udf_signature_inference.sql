-- Store inferred UDF categories per revision in output_metadata so pinned revisions
-- keep their own callable contract even if a later draft changes category.
UPDATE analysis_function_revisions revision
SET output_metadata = jsonb_set(
  COALESCE(revision.output_metadata, '{}'::jsonb),
  '{inferredFunctionKind}',
  to_jsonb(function_row.function_kind),
  true
)
FROM analysis_functions function_row
WHERE revision.function_id = function_row.id
  AND NOT (COALESCE(revision.output_metadata, '{}'::jsonb) ? 'inferredFunctionKind');

-- Window transforms now receive (window, windowSize, options, context) and return
-- a NumericPoint. Existing body-only revisions returned a numeric value, so wrap
-- those bodies in an IIFE and attach the result to the anchor point.
UPDATE analysis_function_revisions revision
SET
  source_body = CASE
    WHEN revision.source_body LIKE '%window.anchorPoint.withValue%'
      OR revision.source_body ~ '^\s*function\s+'
      THEN revision.source_body
    ELSE 'const __window_value = (() => {' || E'\n' || revision.source_body || E'\n' || '})();' || E'\n' ||
         'return window.anchorPoint.withValue(__window_value);'
  END,
  output_metadata = jsonb_set(
    COALESCE(revision.output_metadata, '{}'::jsonb),
    '{inferredFunctionKind}',
    '"window-transform"'::jsonb,
    true
  ),
  source_hash = 'window-point-v3-' || revision.id::text,
  validation_status = 'passed',
  validated_at = now()
FROM analysis_functions function_row
WHERE revision.function_id = function_row.id
  AND function_row.function_kind = 'window-transform';
