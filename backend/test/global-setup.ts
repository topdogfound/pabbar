import { execSync } from 'node:child_process';
import { Redis } from 'ioredis';
import pg from 'pg';

/**
 * E2E tests never touch the dev database. This builds a throwaway `pabbar_test`
 * database from the real migrations (so triggers and indexes are exercised too)
 * and uses Redis logical DB 1 for cache keys.
 *
 * Defaults match docker/docker-compose.yml; override with E2E_PG_URL / E2E_REDIS_URL.
 */
const PG_BASE = process.env.E2E_PG_URL ?? 'postgres://pabbar:pabbar@localhost:4712';
const REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:4713/1';
const TEST_DB = 'pabbar_test';

export default async function setup() {
  const admin = new pg.Client({ connectionString: `${PG_BASE}/postgres` });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: `${PG_BASE}/${TEST_DB}` },
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: 120_000,
  });

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
  await redis.flushdb();
  await redis.quit();
}
