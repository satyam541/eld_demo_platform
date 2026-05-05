import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  INGEST_TCP_PORT: Number(process.env.INGEST_TCP_PORT ?? 2404),
  HEALTH_HTTP_PORT: Number(process.env.HEALTH_HTTP_PORT ?? 9090),
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: process.env.REDIS_URL ?? '',
  SOKETI_HOST: process.env.SOKETI_HOST ?? 'http://localhost:6001',
  SOKETI_APP_ID: process.env.SOKETI_APP_ID ?? 'eld',
  SOKETI_APP_KEY: process.env.SOKETI_APP_KEY ?? 'dev_key',
  SOKETI_APP_SECRET: process.env.SOKETI_APP_SECRET ?? 'dev_secret',
  /** Optional: lock down by source IP. Comma-separated CIDRs or IPs. */
  ALLOWED_SOURCES: process.env.ALLOWED_SOURCES ?? '',
  /** Stale-connection cutoff in seconds. */
  IDLE_TIMEOUT_SEC: Number(process.env.IDLE_TIMEOUT_SEC ?? 600),
};
