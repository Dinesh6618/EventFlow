import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

// Runs the REAL Anthropic SDK against a local stand-in for the Messages API, so the HTTP request
// our code produces (headers, body, streaming) and the way it reads the reply are both checked.
let server;
let seen = [];
let respond;

const sse = (events) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
const okStream = (text, { stop = 'end_turn', model = 'claude-opus-5-5' } = {}) =>
  sse([
    ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 42, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, 5) } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(5) } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 77 } }],
    ['message_stop', { type: 'message_stop' }],
  ]);

let generateJson;
let setAnthropicClient;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen.push({ url: req.url, method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null });
      respond(res);
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;

  const { config } = await import('../src/config.js');
  config.ai.apiKey = 'sk-ant-test-key-123';
  ({ generateJson, setAnthropicClient } = await import('../src/services/ai/anthropic.js'));
  setAnthropicClient(null);
});
after(() => new Promise((resolve) => server.close(resolve)));

const schema = { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' } } };
const ask = () => generateJson({ system: 'Be helpful.', messages: [{ role: 'user', content: 'Plan it' }], schema });

describe('Messages API wire format', () => {
  it('sends an authenticated, streamed structured-output request and reads the streamed reply', async () => {
    seen = [];
    respond = (res) => res.writeHead(200, { 'content-type': 'text/event-stream' }).end(okStream('{"title":"Hello"}'));
    const result = await ask();

    assert.deepEqual(result.json, { title: 'Hello' });
    assert.deepEqual(result.usage, { input: 42, output: 77 });
    assert.equal(result.model, 'claude-opus-5-5');

    assert.equal(seen.length, 1);
    const [req] = seen;
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/messages');
    assert.equal(req.headers['x-api-key'], 'sk-ant-test-key-123', 'the key travels in the header, server to server');
    assert.ok(req.headers['anthropic-version']);
    assert.equal(req.body.stream, true);
    assert.equal(req.body.model, 'claude-opus-5-5');
    assert.equal(req.body.system, 'Be helpful.');
    assert.deepEqual(req.body.messages, [{ role: 'user', content: 'Plan it' }]);
    assert.equal(req.body.output_config.format.type, 'json_schema');
    assert.deepEqual(req.body.output_config.format.schema, schema);
    assert.equal(req.body.output_config.effort, 'medium');
    assert.ok(req.body.max_tokens >= 8000);
    for (const field of ['temperature', 'top_p', 'top_k']) assert.ok(!(field in req.body), `no ${field}`);
    assert.ok(!req.body.thinking || req.body.thinking.type !== 'disabled');
    assert.ok(!JSON.stringify(req.body).includes('sk-ant'), 'the key is never part of the prompt');
  });

  it('maps a refusal and a truncated reply to clear errors', async () => {
    respond = (res) => res.writeHead(200, { 'content-type': 'text/event-stream' }).end(okStream('{"title":"x"}', { stop: 'refusal' }));
    await assert.rejects(ask, (err) => err.status === 422);
    respond = (res) => res.writeHead(200, { 'content-type': 'text/event-stream' }).end(okStream('{"title":"x', { stop: 'max_tokens' }));
    await assert.rejects(ask, (err) => err.status === 502 && /too long/.test(err.message));
  });

  it('maps HTTP errors from the API without leaking details', async () => {
    respond = (res) => res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key: sk-ant-test-key-123' } }));
    await assert.rejects(ask, (err) => err.status === 502 && /credentials/.test(err.message) && !err.message.includes('sk-ant'));

    respond = (res) => res.writeHead(429, { 'content-type': 'application/json', 'retry-after-ms': '1' }).end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }));
    await assert.rejects(ask, (err) => err.status === 429);

    respond = (res) => res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'internal detail about the schema' } }));
    await assert.rejects(ask, (err) => err.status === 502 && !err.message.includes('internal detail'));
  });
});
