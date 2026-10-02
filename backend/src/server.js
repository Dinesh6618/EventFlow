import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, initSchema } from './db.js';
import { startReminderLoop } from './services/reminders.js';

const driver = await initSchema();
const server = createApp().listen(config.port, () => {
  console.log(`EventFlow API listening on http://localhost:${config.port} (database: ${driver})`);
});

const stopReminders = startReminderLoop();

const shutdown = () => server.close(async () => {
  stopReminders();
  await closeDb();
  process.exit(0);
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
