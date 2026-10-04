#!/usr/bin/env node
// mock-gateway.mjs — Local simulator of POST /v1/evaluate to test pipelines with NO key and NO spend.
// Answers are deterministic (word overlap) and do NOT reflect Jev's real quality:
// use them to test flow, CSV output, retries and decision rules, never to calibrate thresholds.
//
//   node mock-gateway.mjs [port=8787]          (MOCK_429_EVERY=5 returns a 429 every 5 requests)
//   JEV_BASE_URL=http://localhost:8787/v1 AI_GATEWAY_API_KEY=test node jev-batch.mjs ...

import { createServer } from 'node:http';

const port = Number(process.argv[2] || process.env.MOCK_PORT || 8787);
const every429 = Number(process.env.MOCK_429_EVERY || 0);
let n = 0;

const words = (x) => new Set(String(typeof x === 'string' ? x : JSON.stringify(x)).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) || []);
const overlap = (a, b) => { const A = words(a), B = words(b); let k = 0; for (const w of A) if (B.has(w)) k++; return A.size ? k / A.size : 0; };
const r2 = (x) => Math.round(x * 100) / 100;
const softmax = (xs) => { const m = Math.max(...xs), e = xs.map((x) => Math.exp((x - m) * 6)); const s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); };

function answer(q, state) {
  if (q.type === 'choice') {
    const keys = Object.keys(q.criteria);
    const ps = softmax(keys.map((k) => overlap(`${k} ${q.criteria[k] ?? ''}`, state)));
    const probabilities = Object.fromEntries(keys.map((k, i) => [k, r2(ps[i])]));
    const choice = keys[ps.indexOf(Math.max(...ps))];
    return { type: 'choice', choice, probabilities };
  }
  if (q.type === 'score') {
    const ps = softmax(q.criteria.map((c, i) => overlap(c, state) + i * 0.01));
    const probabilities = Object.fromEntries(ps.map((p, i) => [String(i), r2(p)]));
    return { type: 'score', score: r2(ps.reduce((s, p, i) => s + p * i, 0)), probabilities };
  }
  const p = Math.min(0.97, Math.max(0.03, 0.05 + overlap(q.instructions, state) * 1.6));
  return { type: 'boolean', probability: r2(p) };
}

createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/evaluate')) { res.writeHead(404).end('not found'); return; }
  if (!/^Bearer \S+/.test(req.headers.authorization || '')) { res.writeHead(401).end('{"error":"missing key"}'); return; }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    n++;
    if (every429 && n % every429 === 0) { res.writeHead(429, { 'retry-after': '0' }).end('{"error":"rate limited"}'); return; }
    let parsed;
    try { parsed = JSON.parse(body); } catch { res.writeHead(422).end('{"error":"bad json"}'); return; }
    const { state, questions } = parsed;
    if (state === undefined || !questions) { res.writeHead(422).end('{"error":"state and questions are required"}'); return; }
    const answers = Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, answer(q, state)]));
    const inputTokens = Math.ceil(body.length / 4);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      model: parsed.model, answers, usage: { inputTokens, outputTokens: 20 },
      providerMetadata: { gateway: { cost: String((inputTokens * 0.042) / 1e6) } },
    }));
  });
}).listen(port, () => console.error(`mock-gateway listening on http://localhost:${port}/v1/evaluate`));
