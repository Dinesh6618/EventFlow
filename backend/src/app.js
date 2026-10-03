import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();
  // Behind a reverse proxy every request would otherwise come from the proxy's address and share one rate limit.
  app.set('trust proxy', config.trustProxy);

  app.use(cors({ origin: config.clientOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d' }));
  app.use('/api', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
