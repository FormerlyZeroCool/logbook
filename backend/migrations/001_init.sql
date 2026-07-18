CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE unit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unit_types_key_format CHECK (key ~ '^[a-z][a-z0-9_-]{0,63}$')
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE RESTRICT,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  scale_to_base NUMERIC NOT NULL,
  offset_to_base NUMERIC NOT NULL DEFAULT 0,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  is_base BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT units_key_format CHECK (key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT units_scale_positive CHECK (scale_to_base > 0),
  CONSTRAINT units_base_identity CHECK (
    NOT is_base OR (scale_to_base = 1 AND offset_to_base = 0)
  ),
  CONSTRAINT units_type_key_unique UNIQUE (unit_type_id, key),
  CONSTRAINT units_type_id_unique UNIQUE (unit_type_id, id)
);

CREATE UNIQUE INDEX units_one_base_per_type_idx
  ON units(unit_type_id)
  WHERE is_base;

CREATE INDEX units_type_name_idx
  ON units(unit_type_id, name);

CREATE TABLE event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  unit_type_id UUID,
  default_unit_id UUID,
  icon TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_types_key_format CHECK (key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT event_types_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT event_types_archive_state CHECK (is_active = (archived_at IS NULL)),
  CONSTRAINT event_types_unit_type_fk
    FOREIGN KEY (unit_type_id) REFERENCES unit_types(id) ON DELETE RESTRICT,
  CONSTRAINT event_types_unit_pair_fk
    FOREIGN KEY (unit_type_id, default_unit_id)
    REFERENCES units(unit_type_id, id) ON DELETE RESTRICT,
  CONSTRAINT event_types_unit_selection_valid CHECK (
    (unit_type_id IS NULL AND default_unit_id IS NULL)
    OR
    (unit_type_id IS NOT NULL AND default_unit_id IS NOT NULL)
  )
);

CREATE INDEX event_types_active_name_idx
  ON event_types (is_active, name);

CREATE TABLE events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT,
  event_kind TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  value DOUBLE PRECISION,
  input_value DOUBLE PRECISION,
  input_unit_id UUID REFERENCES units(id) ON DELETE RESTRICT,
  text_value TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_seconds DOUBLE PRECISION GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (ended_at - started_at))
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (started_at, id),
  CONSTRAINT events_kind_valid CHECK (event_kind IN ('point', 'duration')),
  CONSTRAINT events_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT events_time_shape CHECK (
    (event_kind = 'point' AND ended_at = started_at)
    OR
    (event_kind = 'duration')
  ),
  CONSTRAINT events_value_finite CHECK (
    value IS NULL OR value NOT IN ('Infinity'::float8, '-Infinity'::float8)
  ),
  CONSTRAINT events_input_value_finite CHECK (
    input_value IS NULL OR input_value NOT IN ('Infinity'::float8, '-Infinity'::float8)
  ),
  CONSTRAINT events_input_unit_requires_value CHECK (
    input_unit_id IS NULL OR input_value IS NOT NULL
  )
);

SELECT create_hypertable('events', by_range('started_at'), if_not_exists => TRUE);

CREATE INDEX events_id_idx
  ON events (id, started_at DESC);

CREATE INDEX events_type_started_id_idx
  ON events (event_type_id, started_at DESC, id DESC);

CREATE INDEX events_ongoing_idx
  ON events (event_type_id, started_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX events_metadata_idx
  ON events USING GIN (metadata);

CREATE TRIGGER unit_types_set_updated_at
BEFORE UPDATE ON unit_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER units_set_updated_at
BEFORE UPDATE ON units
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER event_types_set_updated_at
BEFORE UPDATE ON event_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER events_set_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO unit_types(key, name, description)
VALUES
  ('mass', 'Mass', 'Canonical storage unit: gram'),
  ('volume', 'Volume', 'Canonical storage unit: milliliter'),
  ('quantity', 'Quantity', 'Canonical storage unit: count'),
  ('energy', 'Energy', 'Canonical storage unit: watt-hour'),
  ('power', 'Power', 'Canonical storage unit: watt');

INSERT INTO units(unit_type_id, key, name, symbol, scale_to_base, offset_to_base, aliases, is_base)
SELECT ut.id, seed.key, seed.name, seed.symbol, seed.scale_to_base, 0, seed.aliases, seed.is_base
FROM unit_types ut
JOIN (VALUES
  ('mass', 'mg', 'Milligram', 'mg', 0.001::numeric, ARRAY['milligram', 'milligrams']::text[], false),
  ('mass', 'g', 'Gram', 'g', 1::numeric, ARRAY['gram', 'grams']::text[], true),
  ('mass', 'kg', 'Kilogram', 'kg', 1000::numeric, ARRAY['kilogram', 'kilograms', 'kilo', 'kilos']::text[], false),
  ('mass', 'oz', 'Ounce', 'oz', 28.349523125::numeric, ARRAY['ounce', 'ounces']::text[], false),
  ('mass', 'lb', 'Pound', 'lb', 453.59237::numeric, ARRAY['pound', 'pounds', 'lbs']::text[], false),

  ('volume', 'ml', 'Milliliter', 'mL', 1::numeric, ARRAY['milliliter', 'milliliters', 'millilitre', 'millilitres']::text[], true),
  ('volume', 'l', 'Liter', 'L', 1000::numeric, ARRAY['liter', 'liters', 'litre', 'litres']::text[], false),
  ('volume', 'tsp_us', 'US teaspoon', 'tsp', 4.92892159375::numeric, ARRAY['tsp', 'teaspoon', 'teaspoons']::text[], false),
  ('volume', 'tbsp_us', 'US tablespoon', 'tbsp', 14.78676478125::numeric, ARRAY['tbsp', 'tbs', 'tablespoon', 'tablespoons']::text[], false),
  ('volume', 'fl_oz_us', 'US fluid ounce', 'fl oz', 29.5735295625::numeric, ARRAY['fluid ounce', 'fluid ounces']::text[], false),
  ('volume', 'cup_us', 'US cup', 'cup', 236.5882365::numeric, ARRAY['cup', 'cups']::text[], false),

  ('quantity', 'count', 'Count', 'count', 1::numeric, ARRAY['item', 'items', 'each']::text[], true),
  ('quantity', 'dozen', 'Dozen', 'dozen', 12::numeric, ARRAY['dozens']::text[], false),

  ('energy', 'mwh', 'Milliwatt-hour', 'mWh', 0.001::numeric, ARRAY['milliwatt-hour', 'milliwatt-hours']::text[], false),
  ('energy', 'wh', 'Watt-hour', 'Wh', 1::numeric, ARRAY['watt-hour', 'watt-hours', 'watt hour', 'watt hours']::text[], true),
  ('energy', 'kwh', 'Kilowatt-hour', 'kWh', 1000::numeric, ARRAY['kilowatt-hour', 'kilowatt-hours', 'kilowatt hour', 'kilowatt hours']::text[], false),
  ('energy', 'j', 'Joule', 'J', (1::numeric / 3600::numeric), ARRAY['joule', 'joules']::text[], false),
  ('energy', 'kj', 'Kilojoule', 'kJ', (1000::numeric / 3600::numeric), ARRAY['kilojoule', 'kilojoules']::text[], false),

  ('power', 'mw', 'Milliwatt', 'mW', 0.001::numeric, ARRAY['milliwatt', 'milliwatts']::text[], false),
  ('power', 'w', 'Watt', 'W', 1::numeric, ARRAY['watt', 'watts']::text[], true),
  ('power', 'kw', 'Kilowatt', 'kW', 1000::numeric, ARRAY['kilowatt', 'kilowatts']::text[], false),
  ('power', 'megawatt', 'Megawatt', 'MW', 1000000::numeric, ARRAY['megawatt', 'megawatts']::text[], false),
  ('power', 'hp_mechanical', 'Mechanical horsepower', 'hp', 745.69987158227022::numeric, ARRAY['horsepower', 'mechanical horsepower']::text[], false)
) AS seed(type_key, key, name, symbol, scale_to_base, aliases, is_base)
  ON ut.key = seed.type_key;
