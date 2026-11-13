-- Genuine photos downloaded from the source auction and stored on our side.
-- The website serves local_path; source_url stays internal.

CREATE TABLE IF NOT EXISTS lot_photos (
  lot_id      BIGINT      NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  position    SMALLINT    NOT NULL,              -- 0 = main photo, same order as on the auction
  source_url  TEXT        NOT NULL,
  local_path  TEXT        NOT NULL,              -- relative to the site root, e.g. images/cars/CF-XXXXXXX/01.jpg
  bytes       INTEGER     NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lot_id, position)
);
