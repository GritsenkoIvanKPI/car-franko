-- One row per sync run: what was found, added, updated, skipped, and why it ended.

CREATE TABLE IF NOT EXISTS sync_runs (
  id              BIGSERIAL PRIMARY KEY,
  provider_id     TEXT        NOT NULL,
  kind            TEXT        NOT NULL,              -- 'initial' | 'refresh'
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed', 'blocked', 'stopped')),
  requests        INTEGER     NOT NULL DEFAULT 0,
  lots_checked    INTEGER     NOT NULL DEFAULT 0,    -- lot pages fetched
  lots_matched    INTEGER     NOT NULL DEFAULT 0,    -- passed our filters
  lots_added      INTEGER     NOT NULL DEFAULT 0,
  lots_updated    INTEGER     NOT NULL DEFAULT 0,
  lots_unchanged  INTEGER     NOT NULL DEFAULT 0,
  lots_skipped    INTEGER     NOT NULL DEFAULT 0,    -- filtered out, not found, auction already over
  lots_removed    INTEGER     NOT NULL DEFAULT 0,
  errors          INTEGER     NOT NULL DEFAULT 0,
  message         TEXT,
  cursor          TEXT                               -- where to resume (provider page token)
);

CREATE INDEX IF NOT EXISTS sync_runs_provider_idx ON sync_runs (provider_id, started_at DESC);
