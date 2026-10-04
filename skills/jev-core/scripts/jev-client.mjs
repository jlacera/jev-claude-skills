// jev-client.mjs — zero-dependency Jev client (Node >= 18.17 for native fetch; examples use --env-file, Node >= 20.6).
// Calls Jev (TypeSafe AI) through the Vercel AI Gateway evaluation HTTP API:
//   POST https://ai-gateway.vercel.sh/v1/evaluate   { model, state, questions, providerOptions }
// Environment:
//   AI_GATEWAY_API_KEY  (required)   Vercel AI Gateway key, with a spend cap and an expiry
//   JEV_MODEL           (optional)   default 'typesafe-ai/jev'
//   JEV_BASE_URL        (optional)   default 'https://ai-gateway.vercel.sh/v1' (tests point it at a local mock)
//   JEV_ZDR             (optional)   '0' disables Zero Data Retention (on by default, GDPR-friendly)
//
// Usage:  import { evaluate, prob, pool, pickWithGap } from './jev-client.mjs';

import { readFileSync, writeFileSync } from 'node:fs';

export const JEV_MODEL = process.env.JEV_MODEL || 'typesafe-ai/jev';
const BASE_URL = (process.env.JEV_BASE_URL || 'https://ai-gateway.vercel.sh/v1').replace(/\/$/, '');
export const PRICE_PER_MILLION_INPUT = 0.042; // USD. Output is free. See docs.typesafe.ai/models
export const STATE_CHAR_BUDGET = 24000;       // ~6k tokens, well under the 32k limit (state + longest question)

export const usage = { calls: 0, inputTokens: 0, costUsd: 0, failures: 0, startedAt: Date.now() };

export class JevError extends Error {
  constructor(status, body) {
    super(`Jev HTTP ${status}: ${body}`);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One call = one state + N questions evaluated in parallel.
 * questions: { id: { type: 'boolean'|'choice'|'score', instructions, criteria? } }
 * Returns { answers, usage, costUsd, raw }. Throws if any question comes back without a valid answer.
 */
export async function evaluate({ state, questions, maxRetries = 3, zdr = process.env.JEV_ZDR !== '0', signal, timeoutMs = 30000 } = {}) {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error('Missing AI_GATEWAY_API_KEY (put it in .env and run with node --env-file=.env).');
  if (state === undefined || state === null || state === '') throw new Error('empty state');
  if (!questions || !Object.keys(questions).length) throw new Error('empty questions');

  const body = { model: JEV_MODEL, state, questions };
  if (zdr) body.providerOptions = { gateway: { zeroDataRetention: true } };

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(BASE_URL + '/evaluate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal && AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : signal || AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (signal?.aborted || attempt >= maxRetries) { usage.failures++; throw err; } // timeout/network -> retry
      await sleep(backoff(attempt));
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      const missing = incompleteAnswers(questions, data.answers);
      if (missing.length) {
        // Never decide on missing answers: NaN makes every comparison false and would "approve" by default.
        if (attempt < maxRetries) { await sleep(backoff(attempt)); continue; }
        usage.failures++;
        throw new JevError(200, `incomplete answer for: ${missing.join(', ')}`);
      }
      const inputTokens = data.usage?.inputTokens ?? data.usage?.input_tokens ?? 0;
      const reported = parseFloat(data.providerMetadata?.gateway?.cost);
      const costUsd = Number.isFinite(reported) ? reported : (inputTokens * PRICE_PER_MILLION_INPUT) / 1e6;
      usage.calls++;
      usage.inputTokens += inputTokens;
      usage.costUsd += costUsd;
      return { answers: data.answers || {}, usage: data.usage, costUsd, raw: data };
    }

    // 429 rate limit, 529 overloaded, transient 5xx -> retry with exponential backoff
    const retryable = [408, 429, 500, 502, 503, 504, 529].includes(res.status);
    const text = (await res.text()).slice(0, 500);
    if (!retryable || attempt >= maxRetries) { usage.failures++; throw new JevError(res.status, text); }
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
  }
}

/** Question IDs without a valid answer (boolean without a finite probability, choice without an option, score without a number). */
export function incompleteAnswers(questions, answers = {}) {
  return Object.entries(questions).filter(([id, q]) => {
    const a = answers?.[id];
    if (!a) return true;
    if (q.type === 'choice') return typeof a.choice !== 'string';
    if (q.type === 'score') return !Number.isFinite(a.score);
    return !Number.isFinite(prob(a));
  }).map(([id]) => id);
}

const backoff = (attempt) => Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;

// ---------- Reading answers ----------

/** "Yes" probability of a boolean answer (AI SDK / Gateway) or a noul answer (native TypeSafe API). */
export function prob(answer) {
  if (!answer) return NaN;
  if (typeof answer.probability === 'number') return answer.probability;
  if (typeof answer.noul === 'number') return answer.noul;
  return NaN;
}

/** Choice confidence: (pmax - 1/n) / (1 - 1/n). 0 = uniform spread, 1 = certainty. */
export function choiceConfidence(probabilities) {
  const ps = Object.values(probabilities || {});
  const n = ps.length;
  if (n < 2) return ps.length ? 1 : 0;
  return Math.max(0, (Math.max(...ps) - 1 / n) / (1 - 1 / n));
}

/** Score confidence (ordered levels): probability far from the peak costs more than probability next to it. */
export function scoreConfidence(probabilities) {
  const keys = Object.keys(probabilities || {}).sort((a, b) => Number(a) - Number(b));
  const ps = keys.map((k) => probabilities[k]);
  const n = ps.length;
  if (n < 2) return n ? 1 : 0;
  const m = ps.indexOf(Math.max(...ps));
  const spread = ps.reduce((s, p, i) => s + p * Math.abs(i - m), 0);
  const even = ps.reduce((s, _p, i) => s + Math.abs(i - (n - 1) / 2), 0) / n;
  return Math.max(0, 1 - spread / even);
}

/** Choice-style confidence for a boolean: |2p - 1|. */
export const booleanConfidence = (p) => Math.abs(2 * p - 1);

/** Confidence of any answer (uses the provider's value when it comes in providerMetadata). */
export function confidenceOf(answer, providerConfidence) {
  if (typeof providerConfidence === 'number') return providerConfidence;
  if (!answer) return 0;
  if (answer.type === 'choice') return choiceConfidence(answer.probabilities);
  if (answer.type === 'score') return scoreConfidence(answer.probabilities);
  return booleanConfidence(prob(answer));
}

/** Gap between the first and second option of a Choice. */
export function choiceGap(answer) {
  const ps = Object.values(answer?.probabilities || {}).sort((a, b) => b - a);
  return (ps[0] ?? 0) - (ps[1] ?? 0);
}

// ---------- Decision rules ----------

/** Rank boolean questions by probability: [{ key, p }] highest first. */
export function rankBooleans(answers, keys = Object.keys(answers)) {
  return keys.map((key) => ({ key, p: prob(answers[key]) }))
    .filter((r) => Number.isFinite(r.p))
    .sort((a, b) => b.p - a.p);
}

/**
 * Gap rule ("judge the gap, not the number"):
 * the top option wins only if it clears the floor AND clearly beats the runner-up.
 * Returns { winner, top, next, gap, reason }.
 */
export function pickWithGap(ranked, { floor = 0.6, minGap = 0.15 } = {}) {
  const [top, next] = ranked;
  if (!top) return { winner: null, reason: 'no answers' };
  const gap = next ? top.p - next.p : top.p;
  if (top.p < floor) return { winner: null, top, next, gap, reason: `top ${top.p.toFixed(2)} < floor ${floor}` };
  if (next && gap < minGap) return { winner: null, top, next, gap, reason: `gap ${gap.toFixed(2)} < ${minGap}` };
  return { winner: top.key, top, next, gap, reason: 'ok' };
}

/**
 * Three confidence lanes (high / medium / low).
 * high: act automatically; medium: confirm or review; low: human.
 */
export function confidenceLane(conf, { high = 0.85, low = 0.6 } = {}) {
  if (conf >= high) return 'auto';
  if (conf >= low) return 'review';
  return 'human';
}

// ---------- Concurrency ----------

/** Run fn over items with n in flight. 3 by default: bursts trigger 429 / "high demand". Errors are returned, not thrown. */
export async function pool(items, n, fn, { onProgress } = {}) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); }
      catch (err) { out[i] = { __error: String(err.message || err) }; }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }));
  return out;
}

// ---------- Text, cost and I/O ----------

export const truncate = (text, max = STATE_CHAR_BUDGET) => (text.length > max ? text.slice(0, max) : text);

/** Rough estimate: ~4 characters per token. Good enough to budget before a run. */
export const estimateTokens = (x) => Math.ceil((typeof x === 'string' ? x : JSON.stringify(x)).length / 4);
export const estimateCostUsd = (tokens) => (tokens * PRICE_PER_MILLION_INPUT) / 1e6;

export function stripHtml(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html;
  return decodeEntities(main
    .replace(/<(script|style|nav|footer|header|aside|noscript|svg|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

export function toCSV(rows, columns = rows.length ? Object.keys(rows[0]) : []) {
  const esc = (v) => {
    if (v === undefined || v === null) return '';
    const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v);
    const safe = typeof v === 'string' && /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // formula-injection guard (Excel/Sheets)
    return /[",\n\r;]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export function writeCSV(path, rows, columns) { writeFileSync(path, toCSV(rows, columns)); }

/** Reads .csv (comma or semicolon, RFC 4180 quotes), .json (array) or .jsonl. */
export function readTable(path) {
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, '');
  if (path.endsWith('.json')) return JSON.parse(raw);
  if (path.endsWith('.jsonl')) return raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  return parseCSV(raw);
}

export function parseCSV(text) {
  const firstLine = text.split('\n', 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"' && field === '') q = true; // quotes only open at the start of a field
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function report(label = 'Jev') {
  const secs = ((Date.now() - usage.startedAt) / 1000).toFixed(1);
  const line = `${label}: ${usage.calls} calls, ${usage.inputTokens.toLocaleString('en-US')} tokens, ` +
    `$${usage.costUsd.toFixed(5)}, ${usage.failures} failures, ${secs}s`;
  console.error(line);
  return line;
}
