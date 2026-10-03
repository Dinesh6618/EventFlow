import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, initSchema } from './db.js';
import { startHelpEscalationLoop } from './services/helpEscalation.js';
import { startReminderLoop } from './services/reminders.js';

import { NOT_CONFIGURED, verificationRequired } from './services/email/index.js';
import { configProblems, emailConfigured } from './services/email/provider.js';

const driver = await initSchema();
if (!emailConfigured()) {
  console.warn(NOT_CONFIGURED);
  if (verificationRequired()) console.error('Email verification is required but cannot be sent, so new accounts cannot log in until email is set up.');
} else for (const problem of configProblems()) console.warn(`Email: ${problem}`);
const server = createApp().listen(config.port, () => {
  console.log(`EventFlow API listening on http://localhost:${config.port} (database: ${driver})`);
});

const stopReminders = startReminderLoop();
const stopHelpEscalation = startHelpEscalationLoop();

const shutdown = () => server.close(async () => {
  stopReminders();
  stopHelpEscalation();
  await closeDb();
  process.exit(0);
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
