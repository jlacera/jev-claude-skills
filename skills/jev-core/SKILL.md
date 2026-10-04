---
name: jev-core
description: Core skill for Jev, TypeSafe AI's System One decision model (typed yes/no, choice and score answers with calibrated probabilities, input-only pricing around $0.042 per million tokens, no text generation). Covers when Jev beats an LLM, access through Vercel AI Gateway, request shapes, question design, confidence thresholds, cost math and known weak spots, and ships zero-dependency Node and Python clients, a batch engine, a local mock and an n8n template. Use whenever a task needs to classify, score, filter, route, rank or verify many items cheaply, when an LLM call only makes a decision, or when the user mentions Jev, TypeSafe, System One, experimental_evaluate, typesafe-ai/jev, bulk classification, lead scoring or cutting agent costs. Load before jev-growth or jev-ops.
---

# Jev — core (level 1 of 3)

**Jev decides; the LLM writes.** Jev (TypeSafe AI, model `jev-1.13`) reads a `state` and answers typed questions
(yes/no, one of several options, a level on a scale) with a probability on every answer. All questions in one call are
evaluated in parallel against the same `state`: adding questions barely changes latency and only costs the question
tokens. Input-only pricing (~$0.042 per million tokens); output is free. It does not generate text.

Sibling skills: **jev-growth** (SEO internal linking, prospecting, ICP lists, outreach message checks) and
**jev-ops** (bookkeeping review, claim verification, triage, Jev inside agents and workflows).

## 1. Jev or an LLM?

| Use Jev when… | Use an LLM (or code) when… |
|---|---|
| The output is a decision: category, yes/no, level, ranking | You need to write, summarize, translate or generate |
| There is volume (hundreds to millions of items) or latency matters (TypeSafe claims ~150 ms; one networked test: 642 ms) | The task needs multi-step reasoning ("System Two") |
| You want native probabilities to decide when to act and when to escalate | The answer is arithmetic, dates, counting or regex: **code** |
| An expensive LLM is acting as a classifier inside an agent or n8n workflow | The input is image/audio/video not yet converted to text |

Winning pattern: **code filters → Jev judges → code decides → a human approves the doubtful ones → the LLM writes only
for what survives.**

## 2. Golden rules (from published tests and official docs; thresholds are starting points to calibrate)

1. **One call per item, all its questions inside.** Never one call per pair (item × option): you resend the same
   `state` N times. Real case: 586 pages × 15 destinations → $0.21 with one call per page vs $3.17 per pair (15×).
2. **One question = one split-second judgment.** "Does this message convey urgency?" yes; "analyze and decide" no.
   Composite judgments → several atomic questions weighted in code (Composite Scoring).
3. **Ask about behavior, not "relevance".** "A reader who finishes this page still needs X. Would they click it and
   find what they came for?" ranked correctly; "would this be helpful/relevant?" gave zero links or a wrong ranking.
4. **Always add the negative question that cleans the list:** `vendor` (are they selling the same thing?), `agency`
   (an agency, not a buyer?), `documented` (is there enough information?). Whoever talks most about your problem is
   usually selling the fix.
5. **No flat threshold: judge the gap.** Rank, then keep the top answer only if it clears a floor (0.60) **and** beats
   the runner-up by ≥0.15. If two options tie, send it to a human.
6. **Threshold per action, not per model.** Docs: a 0.5–0.6 floor for "don't know"; read-only/reversible ≈0.6–0.7;
   destructive or money-moving >0.85–0.9 with confirmation below that. Tune to the cost of being wrong.
7. **Classifying ≠ authorizing.** "Asked for a refund" is not "grant it": policy is checked in code.
8. **Minimal state.** Only the fields the question needs. Noise costs accuracy ("context rot") and tokens.
   Limit: 32k tokens for `state` + the longest question (trim bodies to ~24k characters); 64k per request.
9. **Low concurrency and retries.** 3 calls at a time; bursts of 40 returned "high demand". 429/529 → backoff.
   Never decide on a missing or NaN answer: treat it as an error and retry or send it to review.
10. **Operational guardrail:** read-only, first 20 items, CSV for review, never send/publish/write to production
    without an explicit "go". Jev hands you a list; a person approves the action.

## 3. Access

- **Recommended route: Vercel AI Gateway.** Create a key at https://vercel.com/ai-gateway/models/jev ("Get API key")
  with a **spend cap and an expiry** (e.g. $1 and 7 days for testing). Vercel may require a card before requests work.
  Model: `typesafe-ai/jev`. Variable: `AI_GATEWAY_API_KEY` in `.env` (add `.env` to `.gitignore`).
  Never in front-end code, the repo or printed logs.
- **Direct TypeSafe:** `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` (or pin `jev-1.13.0` if your
  thresholds were calibrated against it). Keys at console.typesafe.ai (invite-only in Sept 2026: check).
- **Privacy (GDPR):** send `providerOptions.gateway.zeroDataRetention: true` by default (the bundled clients do).
  TypeSafe states it does not train on customer requests. Still: send no personal data the decision does not need.

## 4. Request shape

```json
POST https://ai-gateway.vercel.sh/v1/evaluate     Authorization: Bearer $AI_GATEWAY_API_KEY
{
  "model": "typesafe-ai/jev",
  "state": "text | JSON object | array",
  "questions": {
    "is_urgent":  { "type": "boolean", "instructions": "The message conveys urgency or time-sensitivity",
                    "criteria": { "true": "Explicitly time-sensitive", "false": "No urgency expressed" } },
    "team":       { "type": "choice", "instructions": "Which team should handle this?",
                    "criteria": { "billing": "Payments, invoices, refunds", "technical": "Bugs, outages", "other": "Anything else" } },
    "frustration":{ "type": "score", "instructions": "How frustrated is the customer?",
                    "criteria": ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"] }
  },
  "providerOptions": { "gateway": { "zeroDataRetention": true } }
}
```

Response (`answers` under the same IDs): boolean → `probability`; choice → `choice` + `probabilities`; score →
`score` (weighted mean, zero-indexed, can fall between levels) + `probabilities`. Cost in
`providerMetadata.gateway.cost`. Probabilities are rounded to 2 decimals: do not renormalize.

| Route | Call | Yes/no type | Field |
|---|---|---|---|
| AI SDK ≥7.0.105 (`npm i ai`) | `experimental_evaluate({ model: 'typesafe-ai/jev', state, questions })` | `boolean` | `probability` |
| Gateway HTTP (any language, n8n) | `POST /v1/evaluate` | `boolean` | `probability` |
| Native TypeSafe API / Python `typesafe_sdk` | `POST /v1/systemone` | `noul` | `noul` |

The Gateway's OpenAI-compatible endpoints do **not** work for Jev. Limits: Choice 2–255 options; Score 2–10 levels
(lowest to highest); question IDs are not sent to the model, so the full question goes in `instructions`.

## 5. Choosing the question type

- **boolean**: a crisp condition where the probability is the signal ("is a refund requested?"). 0.5 means unsure,
  not "medium".
- **choice**: one of N unordered options (routing, document type). Always add `other`/`none`. Describe each option
  ("Blocking with no workaround") instead of labelling it ("high"). Jev leans toward the first option: when it matters,
  reorder and check the answer holds.
- **score**: a position on a spectrum with defined levels (severity, maturity, fit). For "is X strong at Y?" use a
  Score with levels, not a boolean.
- When two types fit, pick the one your code can act on directly: Choice → `switch`, Score → threshold, boolean → `if`.
- **Speculative fan-out:** also ask what matters only for some inputs (severity even if it may not be a bug); code
  ignores what does not apply. Per docs.typesafe.ai/primitives (Parallel questions cookbook), 13 questions in 1 call
  were 11.5× cheaper and 9.6× faster than 13 calls (other write-ups cite 12.2× and 10×; same order of magnitude).
- **Real dependencies** (the 2nd question needs data that only exists after the 1st) → a second call. Otherwise, batch.
- Point at parts of the state with backtick paths: ``"Does `ticket.messages[0].text` request a refund?"``.

## 6. Deciding with the probabilities

```js
// Gap rule
const ranked = rankBooleans(answers);              // [{key, p}] highest first
const { winner } = pickWithGap(ranked, { floor: 0.60, minGap: 0.15 });  // null -> human / no action
// Three confidence lanes
confidenceLane(conf, { high: 0.85, low: 0.6 });    // 'auto' | 'review' | 'human'
```

- **Choice confidence** = (pmax − 1/n)/(1 − 1/n). **Boolean** = |2p − 1|. **Score**: 1 − (Σ pᵢ·|i − m|) / MAD_uniform,
  with m the most likely level (probability on distant levels costs more). Via the AI SDK it arrives in
  `providerMetadata.typesafe.confidence`; the bundled clients recompute it when absent.
- Useful alternatives: the winner's probability, or the top-to-second ratio (when it comes down to two candidates).
- **Calibrate before automating:** 30–50 examples with known answers → run the same questions → pick thresholds from
  the error you can tolerate. Recipe thresholds are starting points, not truths.
- **Suspiciously identical scores** across different items = near-duplicates (in SEO: cannibalization).

## 7. Cost

`cost ≈ calls × tokens per call × $0.042 / 1,000,000`. Tokens ≈ characters/4 (state + questions).

| Case | Math | Cost |
|---|---|---|
| Internal linking, 586 pages × 15 destinations | 586 × ~8,577 tok = 5.03 M | ~$0.21 |
| Same job, one call per pair (mistake) | 75.4 M tok | ~$3.17 |
| 5,000 companies, short record (~500 tok) | 2.5 M tok | ~$0.10–0.11 |
| 1,000 tickets/messages (~800 tok) | 0.8 M tok | ~$0.03 |

Before running a batch: `--dry-run` estimates tokens and cost. "190× cheaper than a frontier model" claims depend on
the denominator (per page vs total): never mix them in one sentence for a client.

## 8. Known weak spots (jev-1.13)

| Failure | Do this instead |
|---|---|
| Literal reading (answers what you wrote, not what you meant) | State the exact condition; boundary cases in `criteria`; if you catch yourself explaining "what I meant", that is the missing half of the question |
| Math, counting, comparing numbers | Code. To count: one question per item, sum in code |
| Dates (ordering, deadlines, windows) | Extract parts with Choice (day/month/year + "not stated") and compute in code |
| Indirection, double negatives, conditional instructions | Direct questions, one property each; decide in code whether a question applies |
| Large state full of noise | Retrieve/filter in code first, or a relevance boolean beforehand |
| Adversarial content (prompt injection in the state) | Explicit criteria; test edge cases; do not automate risky actions |
| Instructions and criteria that contradict | Make `criteria` an extension of `instructions` (never true = "no") |
| Choice option order | Reorder and check consistency |
| Generating text or extracting free values | Extract candidates with regex/an LLM and let Jev pick one (Choice) |

**Language:** English is the primary training language and where accuracy is best; other languages are "handled but
not equally well" (docs). For non-English content: keep the `state` in its original language and A/B test the
`instructions` in English vs that language on a labelled set before fixing thresholds (a hypothesis to validate).

## 9. Bundled tools (`scripts/`, when the full plugin is installed)

| File | Purpose |
|---|---|
| `jev-client.mjs` | Zero-dependency Node ≥18.17 client (`--env-file` needs ≥20.6); rejects incomplete answers, 30 s timeout: `evaluate`, `pool`, `prob`, `pickWithGap`, `rankBooleans`, confidence helpers, CSV, cost |
| `jev_client.py` | Zero-dependency Python ≥3.9 client (FastAPI, workers): `Jev().evaluate`, `evaluate_many`, `pick_with_gap` |
| `jev-batch.mjs` | Generic CSV/JSON/JSONL → CSV engine driven by a `.mjs` config (`state`, `questions`, `decide`, `skip`, `sort`). `--dry-run`, `--limit 20` by default, `--all` |
| `mock-gateway.mjs` | Local `/v1/evaluate` simulator to test pipelines with no key and no spend (fake answers: never calibrate on it) |
| `n8n-jev-lead-triage.json` | Importable n8n workflow: HTTP Request to Jev → Code (confidence and lane) → IF |

```bash
node --env-file=.env scripts/jev-batch.mjs <config.mjs> data.csv --dry-run     # estimated cost
node --env-file=.env scripts/jev-batch.mjs <config.mjs> data.csv --limit 20    # sample -> review the CSV
node --env-file=.env scripts/jev-batch.mjs <config.mjs> data.csv --all         # after "go"
# No key: node scripts/mock-gateway.mjs & JEV_BASE_URL=http://localhost:8787/v1 AI_GATEWAY_API_KEY=test node ...
```

If `scripts/` is not available, generate a minimal client: `fetch` POST to `/v1/evaluate` with the JSON in section 4,
30 s timeout, backoff retries on 429/529, a pool of 3, a check that every question got an answer, and `.env` out of Git.

Minimal `jev-batch.mjs` config:

```js
export default {
  name: 'my-task',
  state: (row) => ({ message: row.message }),                      // only what the decision needs
  questions: { spam: { type: 'boolean', instructions: 'The sender is selling their own services.' } },
  decide: (a, row, h) => ({ verdict: h.prob(a.spam) >= 0.8 ? 'ARCHIVE' : 'REVIEW', p: h.prob(a.spam), id: row.id }),
};
```

## 10. Working with a coding agent (Claude Code / Codex)

1. State the decision in one sentence and the cost of getting it wrong (is it reversible?).
2. Keep questions and thresholds in **one file** (constants a person can review).
3. `--dry-run` → show the cost. 4. Run 20 items → show the CSV → wait for "go".
5. Calibrate on known examples; fix wording before thresholds. 6. Full batch; report the real cost.
7. Nothing is sent, published or written to client systems without explicit approval.

References: `references/api-and-setup.md` (step-by-step setup, AI SDK, Python, n8n, errors, an install prompt for
agents) and `references/resources.md` (curated repos, demos and official docs).
Official docs: docs.typesafe.ai (primitives, confidence, patterns, model-jaggedness/jev-1.13, models). Official
TypeSafe skill: `claude plugin marketplace add typesafe-ai/skills` → `claude plugin install typesafe@typesafe-ai`.
