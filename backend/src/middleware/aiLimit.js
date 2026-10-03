import { rateLimit } from './rateLimit.js';

/**
 * Every model call costs money, so each organizer gets a modest hourly allowance shared by all AI
 * features (currently the recommendation ideas).
 */
export const aiGenerationLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: (req) => `ai:${req.user.id}` });
