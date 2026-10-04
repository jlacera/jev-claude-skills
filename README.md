# jev-claude-skills

**Claude skills for [Jev](https://typesafe.ai), TypeSafe AI's System One decision model — built for SEO, growth and
automation work.**

Jev answers typed questions about a piece of text (yes/no, one of N options, a level on a scale) with a calibrated
probability on every answer. It costs about **$0.042 per million input tokens**, output is free, and every question in
a call is evaluated in parallel. That makes it the right tool whenever an LLM is only being used to *decide* something:
classify, score, filter, route, rank or verify — at a fraction of the cost.

> Unofficial community project. Not affiliated with or endorsed by TypeSafe AI or Vercel.

## What's inside

| Level | Skill | What it covers |
|---|---|---|
| 1 | [`jev-core`](skills/jev-core/SKILL.md) | When Jev beats an LLM, access via Vercel AI Gateway, request shapes, question design, confidence thresholds, cost math, known weak spots. Zero-dependency Node and Python clients, a batch engine, a local mock, an n8n workflow, a curated resource list |
| 2 | [`jev-growth`](skills/jev-growth/SKILL.md) | SEO internal linking (586 pages for $0.21), near-duplicate detection, finding prospects ready to buy, checking outreach messages before they go, Clay-style ICP lists that judge before paying to enrich |
| 3 | [`jev-ops`](skills/jev-ops/SKILL.md) | Read-only bookkeeping review, claim and citation checks against sources, confidence-gated triage, replacing decision-only LLM calls in agents and n8n, product integration patterns |

Skills load on demand: `jev-core` triggers on any Jev / bulk-classification task; the other two build on it.

## Install

**Claude Code (plugin):**

```bash
/plugin marketplace add jlacera/jev-claude-skills
/plugin install jev-claude-skills@jev-claude-skills
```

**Claude Code (manual, all projects):** copy each folder in `skills/` to `~/.claude/skills/`.

**Claude.ai / Claude Desktop:** zip each folder in `skills/` and upload it under Settings → Capabilities → Skills.
The skills work without the scripts (they describe how to generate them); the full plugin adds the tested scripts.

## Configure

```bash
cp .env.example .env        # add a Vercel AI Gateway key with a spend cap and an expiry
```

Get a key at <https://vercel.com/ai-gateway/models/jev>. Node ≥ 18.17 (≥ 20.6 for `--env-file`), Python ≥ 3.9.
No external dependencies.

## Try it without a key

```bash
bash tests/run-tests.sh     # starts a local mock gateway and a test site, runs every recipe
```

The mock validates flow, CSV output, retries (429) and decision rules. It does **not** reproduce Jev's quality:
calibrate thresholds against the real API with 30–50 labelled examples.

## Quick use

```bash
cd skills
node --env-file=../.env jev-growth/scripts/internal-links.mjs --sitemap https://example.com/sitemap.xml --dest destinations.json --anchors
node --env-file=../.env jev-core/scripts/jev-batch.mjs jev-growth/scripts/configs/icp-company-fit.mjs companies.csv --dry-run
node --env-file=../.env jev-core/scripts/jev-batch.mjs jev-ops/scripts/configs/bookkeeping-review.mjs transactions.csv
node --env-file=../.env jev-core/scripts/jev-batch.mjs jev-ops/scripts/configs/claim-check.mjs claims.jsonl
node --env-file=../.env jev-core/scripts/jev-batch.mjs jev-ops/scripts/configs/lead-inbound-triage.mjs leads.csv
```

Everything is read-only: scripts write a CSV for review. Nothing is published, sent or written to anyone's systems.
Batches default to the first 20 rows; `--all` runs the rest after you have reviewed the sample.

## Design principles

1. One call per item, every question inside it — never one call per pair.
2. One question = one split-second judgment; combine answers in code.
3. Judge the gap between the top two answers, not a flat threshold.
4. Always ask the negative question (vendor, agency, documented) that cleans the list.
5. Classifying is not authorizing: policy and arithmetic stay in code.
6. Missing answers are errors, never defaults.
7. A human approves every action.

## Sources

Field guides by Ben Broch at [brochbuilds.com](https://brochbuilds.com/jev) (`/jev`, `/seo`, `/prospect`,
`/bookkeeping`, `/leads`, `/legal`, `/jev/resources`; Sept 2026), the official docs at
[docs.typesafe.ai](https://docs.typesafe.ai) (primitives, confidence, patterns, models, model-jaggedness/jev-1.13, api,
use-case-map, agent-skill) and the [Vercel AI Gateway evaluation docs](https://vercel.com/docs/ai-gateway/modalities/evaluation).
Headline figures come from third-party public demos; each skill says what was tested and what was not.

## Contributing

Issues and pull requests are welcome, especially calibration results on real data and new recipes. Keep the rules:
read-only by default, questions and thresholds in one reviewable place, and a test against the mock.

## License

MIT — see [LICENSE](LICENSE).

Maintained by Jesús Lacera — [SEO-Invoke](https://seo-invoke.com).
