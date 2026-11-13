-- Lots imported from auctions. One row per (source, source_lot_id); sync upserts into it.

CREATE TABLE IF NOT EXISTS lots (
  id                    BIGSERIAL PRIMARY KEY,
  source                TEXT        NOT NULL CHECK (source IN ('copart', 'iaai')),
  source_lot_id         TEXT        NOT NULL,
  stock_number          TEXT,
  lot_url               TEXT        NOT NULL,

  vin                   TEXT,
  vin_masked            BOOLEAN     NOT NULL DEFAULT false,

  year                  SMALLINT    NOT NULL,
  make                  TEXT        NOT NULL,
  model                 TEXT        NOT NULL,
  trim                  TEXT,

  body_type             TEXT        NOT NULL,
  body_style_raw        TEXT,
  color                 TEXT,
  engine_raw            TEXT,
  engine_l              NUMERIC(4,1),
  cylinders             SMALLINT,
  fuel                  TEXT        NOT NULL,
  transmission          TEXT        NOT NULL,
  drive                 TEXT        NOT NULL,

  odometer_mi           INTEGER,
  odometer_km           INTEGER,
  odometer_status       TEXT        NOT NULL,

  primary_damage        TEXT,
  primary_damage_raw    TEXT,
  secondary_damage      TEXT,
  secondary_damage_raw  TEXT,

  title_type            TEXT,
  title_raw             TEXT,
  title_state           TEXT,

  keys                  BOOLEAN,
  drivability           TEXT        NOT NULL,

  location_city         TEXT,
  location_state        TEXT,
  location_zip          TEXT,
  location_branch       TEXT,
  location_lat          DOUBLE PRECISION,
  location_lng          DOUBLE PRECISION,

  sale_date             TIMESTAMPTZ,
  current_bid_usd       NUMERIC(12,2),
  buy_now_usd           NUMERIC(12,2),

  photos                JSONB       NOT NULL DEFAULT '[]'::jsonb,

  status                TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'removed')),
  source_status         TEXT,
  status_changed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  content_hash          TEXT        NOT NULL,
  raw_json              JSONB       NOT NULL,

  CONSTRAINT lots_source_lot_uq UNIQUE (source, source_lot_id)
);

CREATE INDEX IF NOT EXISTS lots_status_sale_idx  ON lots (status, sale_date);
CREATE INDEX IF NOT EXISTS lots_make_model_idx   ON lots (make, model);
CREATE INDEX IF NOT EXISTS lots_year_idx         ON lots (year);
CREATE INDEX IF NOT EXISTS lots_bid_idx          ON lots (current_bid_usd);
CREATE INDEX IF NOT EXISTS lots_last_seen_idx    ON lots (source, last_seen_at);
CREATE INDEX IF NOT EXISTS lots_vin_idx          ON lots (vin) WHERE vin IS NOT NULL AND NOT vin_masked;
