#!/usr/bin/env node
// jev-batch.mjs — Generic engine: one row = one Jev call with all its questions.
//
//   node --env-file=.env jev-batch.mjs <config.mjs> <input.csv|json|jsonl> [options]
//
// Options:
//   --out output.csv     output file (default <config>.out.csv)
//   --limit 20           rows to process (default 20: review a sample first)
//   --all                process every row (overrides --limit)
//   --concurrency 3      simultaneous calls (raise slowly; bursts get 429s)
//   --dry-run            no Jev calls: estimates tokens and cost and prints the first request
//
// The config is an ES module whose default export is:
//   {
//     name: 'icp-company-fit',
//     state: (row) => string | object,                    // what Jev reads (only what the decision needs)
//     questions: {...} | (row) => ({...}),                 // typed questions, all in ONE call
//     decide: (answers, row, h) => ({ column: value }),    // business rules in code, not in the prompt
//     skip?: (row, h) => ({...}) | null,                   // resolve a row in code without a call (e.g. source not found)
//     sort?: (a, b) => number,                             // output order (e.g. disagreements first)
//     columns?: [...],                                     // CSV column order
//   }
// h = jev-client helpers (prob, pickWithGap, rankBooleans, choiceConfidence, confidenceLane, ...)

import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as h from './jev-client.mjs';

const BOOLEAN_FLAGS = new Set(['all', 'dry-run']);
const args = process.argv.slice(2);
const opts = {}, positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const name = args[i].slice(2);
    opts[name] = BOOLEAN_FLAGS.has(name) ? true : args[++i];
  } else positional.push(args[i]);
}
const flag = (name, def) => (name in opts ? opts[name] : def);
const [configPath, inputPath] = positional;

if (!configPath || !inputPath) {
  console.error('Usage: node --env-file=.env jev-batch.mjs <config.mjs> <input.csv|json|jsonl> [--out f.csv] [--limit 20|--all] [--concurrency 3] [--dry-run]');
  process.exit(1);
}

const num = (name, def, min = 1) => {
  const v = Number(flag(name, def));
  if (!Number.isFinite(v) || v < min) { console.error(`--${name} must be a number >= ${min}`); process.exit(1); }
  return v;
};
const config = (await import(pathToFileURL(resolve(configPath)).href)).default;
const rows = h.readTable(resolve(inputPath));
const limit = flag('all', false) ? rows.length : num('limit', 20);
const batch = rows.slice(0, limit);
const concurrency = num('concurrency', 3);
const out = flag('out', basename(configPath).replace(/\.m?js$/, '') + '.out.csv');
const questionsFor = (row) => (typeof config.questions === 'function' ? config.questions(row) : config.questions);

if (flag('dry-run', false)) {
  let tokens = 0;
  for (const row of batch) tokens += h.estimateTokens(config.state(row)) + h.estimateTokens(questionsFor(row));
  const perRow = tokens / Math.max(1, batch.length);
  console.log(JSON.stringify({ state: config.state(batch[0]), questions: questionsFor(batch[0]) }, null, 2));
  console.log(`\n[dry-run] ${batch.length} of ${rows.length} rows. ~${Math.round(perRow)} tokens/call.`);
  console.log(`[dry-run] Estimated cost, sample: $${h.estimateCostUsd(tokens).toFixed(5)} · ` +
    `all rows: $${h.estimateCostUsd(perRow * rows.length).toFixed(4)}`);
  process.exit(0);
}

const results = await h.pool(batch, concurrency, async (row) => {
  const skipped = config.skip?.(row, h); // row resolved in code (no call spent)
  if (skipped) return skipped;
  const { answers } = await h.evaluate({ state: config.state(row), questions: questionsFor(row) });
  return { ...config.decide(answers, row, h) };
}, { onProgress: (d, t) => { if (d % 10 === 0 || d === t) console.error(`  ${d}/${t}`); } });

const ok = [], failed = [];
results.forEach((r, i) => (r && r.__error ? failed.push({ row: i + 1, error: r.__error }) : ok.push(r)));
if (config.sort) ok.sort(config.sort);

h.writeCSV(out, ok, config.columns);
console.log(`${ok.length} rows -> ${out}${failed.length ? ` · ${failed.length} with errors` : ''}`);
if (failed.length) console.error(failed.slice(0, 5));
h.report(config.name || 'jev-batch');
if (batch.length < rows.length) console.log(`Sample of ${batch.length}/${rows.length}. Review the CSV, then rerun with --all.`);
