import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env.NODE_ENV || 'development';

if (env === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}

export const config = {
  env,
  port: Number(process.env.PORT) || 5000,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: '7d',
  databaseUrl: process.env.DATABASE_URL || '',
  pgliteDir: path.resolve(rootDir, process.env.PGLITE_DIR || '.data/pglite'),
  // Where certificate QR codes point; must be the public address of the web app.
  publicAppUrl: (process.env.PUBLIC_APP_URL || (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, ''),
  // AI features. The key stays on the server: it is never sent to the browser or logged.
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-opus-5-5',
    effort: process.env.AI_EFFORT || 'medium',
    maxTokens: Number(process.env.AI_MAX_TOKENS) || 16000,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 180000,
  },
  uploadDir: path.join(rootDir, 'uploads'),
  migrationsDir: path.join(rootDir, 'db', 'migrations'),
};
