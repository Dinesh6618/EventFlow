import { closeDb, initSchema } from '../db.js';

const driver = await initSchema();
console.log(`Database schema is ready (${driver}).`);
await closeDb();
