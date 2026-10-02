import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';
import { HttpError } from '../../utils/httpError.js';

/**
 * The only place the backend talks to Claude. The API key is read from the server environment
 * and never leaves it; nothing here (or in any response) includes the key.
 */

let client = null;

/** Swap the SDK client (tests inject a fake). Pass null to go back to the real one. */
export function setAnthropicClient(next) {
  client = next;
}

export const aiStatus = () => ({ configured: Boolean(config.ai.apiKey) || client !== null, model: config.ai.model });

function getClient() {
  if (client) return client;
  if (!config.ai.apiKey) {
    throw new HttpError(503, 'The AI planner is not set up on this server. Ask the administrator to set ANTHROPIC_API_KEY.');
  }
  client = new Anthropic({ apiKey: config.ai.apiKey, timeout: config.ai.timeoutMs });
  return client;
}

/** Turn SDK failures into clean API errors without leaking provider details. */
function translate(err) {
  if (err instanceof HttpError) return err;
  const status = err?.status;
  if (err instanceof Anthropic.RateLimitError || status === 429) return new HttpError(429, 'The AI service is busy right now. Please try again in a minute.');
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || status === 401 || status === 403) {
    console.error('Anthropic rejected the configured credentials');
    return new HttpError(502, 'The AI service rejected this server\'s credentials. Ask the administrator to check ANTHROPIC_API_KEY.');
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new HttpError(504, 'The AI service took too long to respond. Please try again.');
  if (err instanceof Anthropic.APIConnectionError) return new HttpError(502, 'Could not reach the AI service. Please try again.');
  console.error('Anthropic request failed:', err?.status, err?.message);
  return new HttpError(502, 'The AI service could not complete that request. Please try again.');
}

/**
 * Ask Claude for JSON that matches `schema` (a JSON Schema object) and return the parsed value.
 * `messages` is the full conversation; the model is told to follow the schema by the API itself
 * (structured outputs), so the reply is parseable JSON unless it was refused or cut off.
 */
export async function generateJson({ system, messages, schema }) {
  const ai = getClient();
  let message;
  try {
    // Streaming keeps long plans clear of HTTP timeouts. Thinking is adaptive by default on this model.
    const stream = ai.messages.stream({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      system,
      messages,
      output_config: { effort: config.ai.effort, format: { type: 'json_schema', schema } },
    });
    message = await stream.finalMessage();
  } catch (err) {
    throw translate(err);
  }

  if (message.stop_reason === 'refusal') {
    throw new HttpError(422, 'The AI declined to plan this event. Try describing the event differently.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new HttpError(502, 'The plan was too long to finish. Try a simpler request or fewer sessions.');
  }

  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'The AI returned a plan that could not be read. Please try again.');
  }
  return {
    text,
    json,
    model: message.model ?? config.ai.model,
    usage: { input: message.usage?.input_tokens ?? 0, output: message.usage?.output_tokens ?? 0 },
  };
}
