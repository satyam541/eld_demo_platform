-- TimescaleDB initialization for the Geometris ELD platform.
-- Run AFTER `prisma migrate deploy` so the tables already exist.
--
-- Usage:
--   psql "$DATABASE_URL" -f sql/001_init_timescale.sql

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert Location to a hypertable partitioned by ts (1 day chunks).
SELECT create_hypertable(
  '"Location"',
  'ts',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- Compress chunks older than 7 days (saves ~10x disk).
ALTER TABLE "Location" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"deviceId"',
  timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('"Location"', INTERVAL '7 days', if_not_exists => TRUE);

-- Drop chunks older than 12 months.
SELECT add_retention_policy('"Location"', INTERVAL '365 days', if_not_exists => TRUE);
