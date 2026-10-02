import fs from 'node:fs';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from './config.js';

// One tiny interface over two PostgreSQL drivers:
//  - DATABASE_URL set  -> a real PostgreSQL server through `pg`
//  - DATABASE_URL empty -> embedded PostgreSQL (PGlite) stored on disk, zero setup
let connection;

async function connect() {
  if (connection) return connection;

  if (config.databaseUrl) {
    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    connection = {
      driver: 'postgres',
      query: async (text, params) => (await pool.query(text, params)).rows,
      exec: (text) => pool.query(text),
      close: () => pool.end(),
    };
  } else {
    fs.mkdirSync(config.pgliteDir, { recursive: true });
    const lite = new PGlite(config.pgliteDir);
    await lite.waitReady;
    connection = {
      driver: 'pglite',
      query: async (text, params) => (await lite.query(text, params)).rows,
      exec: (text) => lite.exec(text),
      close: () => lite.close(),
    };
  }
  return connection;
}

export async function query(text, params = []) {
  const db = await connect();
  return db.query(text, params);
}

export async function initSchema() {
  const db = await connect();
  await db.exec(fs.readFileSync(config.schemaFile, 'utf8'));
  return db.driver;
}

export async function closeDb() {
  if (connection) {
    await connection.close();
    connection = undefined;
  }
}
