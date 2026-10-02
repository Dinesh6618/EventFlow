import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from './config.js';

// One small interface over two PostgreSQL drivers:
//  - DATABASE_URL set   -> a real PostgreSQL server through `pg`
//  - DATABASE_URL empty -> embedded PostgreSQL (PGlite) stored on disk, zero setup
//
// A "runner" is `(sql, params) => Promise<rows>`. `transaction` hands the callback a runner bound
// to one connection (with `runner.exec` for multi-statement scripts). Never call the top-level
// `query` from inside a transaction callback: use the runner you were given.
let connection;

async function connect() {
  if (connection) return connection;

  if (config.databaseUrl) {
    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    connection = {
      driver: 'postgres',
      query: async (text, params) => (await pool.query(text, params)).rows,
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const run = async (text, params) => (await client.query(text, params)).rows;
          run.exec = (text) => client.query(text);
          const result = await fn(run);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    fs.mkdirSync(config.pgliteDir, { recursive: true });
    const lite = new PGlite(config.pgliteDir);
    await lite.waitReady;
    connection = {
      driver: 'pglite',
      query: async (text, params) => (await lite.query(text, params)).rows,
      transaction: (fn) =>
        lite.transaction((tx) => {
          const run = async (text, params) => (await tx.query(text, params)).rows;
          run.exec = (text) => tx.exec(text);
          return fn(run);
        }),
      close: () => lite.close(),
    };
  }
  return connection;
}

export async function query(text, params = []) {
  const db = await connect();
  return db.query(text, params);
}

/** Run `fn(run)` atomically; rolls back if it throws. */
export async function transaction(fn) {
  const db = await connect();
  return db.transaction(fn);
}

/** Apply any db/migrations/*.sql files that have not run yet, in name order. */
export async function initSchema() {
  const db = await connect();
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
  const applied = new Set((await db.query('SELECT name FROM schema_migrations')).map((r) => r.name));

  const files = fs.readdirSync(config.migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(config.migrationsDir, file), 'utf8');
    await db.transaction(async (run) => {
      await run.exec(sql);
      await run('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
  }
  return db.driver;
}

export async function closeDb() {
  if (connection) {
    await connection.close();
    connection = undefined;
  }
}
