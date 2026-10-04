---
name: jev-ops
description: Operations, verification and product recipes built on Jev (TypeSafe AI's cheap decision model) - read-only bookkeeping review that categorizes every transaction and flags what needs a human, claim and citation checking against sources (legal memos, AEO/GEO content, client reports, RAG answers), inbound lead and ticket triage with confidence-gated routing, and replacing decision-only LLM calls inside agents and n8n workflows (model routing, output guardrails), plus product integration patterns for SaaS. Use when the user asks to review accounts or categorize transactions, verify citations or fact-check content against sources, triage or route leads and tickets, moderate, add guardrails, cut the cost of n8n or agent pipelines, build a model router, or decide where Jev fits in a SaaS product. Requires jev-core.
---

# Jev — operations, verification and product (level 3)

Requires **jev-core**. Same move as always: one item = one state, all questions in one call, the decision in code,
the doubtful ones to a person. Nothing here writes to client systems or gives legal or tax advice.

Scripts: bundled in the `jev-skills` plugin (this skill's `scripts/configs/` + `jev-core/scripts/jev-batch.mjs`). If
they are not installed, generate them from the rules in this skill.

---

## A. Bookkeeping review (a second opinion, read-only)

**Public case** (@andywang, founder of Finta, 22 Sept 2026; his claims, not a benchmark): 34 months of books that a
firm had charged >$20,000 for, redone and checked in ~20 s for 32¢; an on-screen counter showed >10,000 decisions in
19 s. In parallel it did: category and department of every transaction, journal entries for amortizations and
accruals, uncollected invoices to write off, and reconciliations. It caught **a SAFE investment booked as revenue** and
a miscategorised contractor. Code not published (as of 28 Sept). The part worth copying: **it knew when to stop** —
with too little documentation it marked "should've asked more questions" instead of forcing an answer.

Design (one call per transaction; state = date, amount, counterparty, memo as plain text):
- one boolean per candidate category (~10 accounts covering most spend): `This transaction belongs in <category>.`
- **investment**: `This money is an investment or loan (equity, SAFE, a note), not revenue.`
- **documented**: `There is enough information here to categorize this transaction with confidence.`

Decision: first the **ALERT** when investment ≥ 0.6 and either the bookkeeper or Jev filed it as revenue; then
**documented < 0.50 or the top two categories within 0.15 → NEEDS A HUMAN**; then disagree/agree with the bookkeeper's
category → CSV with **alerts and disagreements first**. Thresholds were not run by the source: validate them on a
month you already know is right. Jev does not add up amounts or compare dates: that stays in code.

```bash
node --env-file=.env ../jev-core/scripts/jev-batch.mjs scripts/configs/bookkeeping-review.mjs transactions.csv --dry-run
```
Export from QuickBooks/Xero/Holded/your bank to CSV (date, amount, vendor, memo, category). Edit the category keys in
the config to match your chart of accounts. Take disagreements to whoever signs your taxes before changing anything:
Jev only sees the export, not the handshake deal or the receipt in someone's inbox.

## B. Verify claims against their source

**Public cases** (22 Sept 2026, not tested by the source): **LegalJev** (legaljev.com, free, no signup, says it
doesn't store data) checked every citation in a 7-page memo in <9 s and found 1 potentially fabricated citation plus
several claims the cited cases don't support or contradict; modes *Audit citations* (paste text or up to 20
PDF/DOCX/TXT/MD files) and *Find authorities*. **Monid** (paid API; MIT connector at github.com/monid-ai/monid): "how
long does a landlord have to return a security deposit?" → 134 statute sections across 45 states, same rule in 42,
exact deadline quoted from 12 statutes; 17 calls, $0.80, 3.6 s. Both are **US-only** (Monid uses Vaquill's
federal/state statute database plus Jev); for other jurisdictions, retrieve the official source in code.

General pattern (works for any "claim vs source"):
- **State:** `CLAIM: <sentence from the document> / SOURCE EXCERPTS: <most related passages from the source>`.
- **supports**: `The source excerpts support the claim as written.`
- **contradicts**: `The source excerpts say the opposite of the claim.`
- **quote** (only when the sentence contains a quotation; detect it with a regex): `The quotation in the claim appears in the source excerpts word for word.`
- Flag if supports < 0.50, contradicts > 0.50 or quote < 0.50. Order: **NOT FOUND** (the source can't be found: the
  loudest flag, and it needs no model) → contradicts → quote not verbatim → weak support. Missing answer → REVIEW.
- Jev earns its place on the subtle problem: a real source cited for something it doesn't say.

Uses: QA of AEO/GEO content before publishing (every figure with its source), figures in audit reports, chatbot/RAG
answers vs their context, advertising claims.

```bash
node --env-file=.env ../jev-core/scripts/jev-batch.mjs scripts/configs/claim-check.mjs claims.jsonl --all
```
A first pass for human review; it never rewrites. Not legal advice.

## C. Triage and confidence-gated routing

Classify → measure confidence → act only if the action tolerates the error.
- An intent **Choice** (always with `other`) + an urgency **Score** + speculative booleans (budget, in-market region,
  vendor/spam) in **one** call.
- Lanes: confidence ≥ 0.85 → automatic (template, queue); 0.6–0.85 → review/confirm; < 0.6 → human.
  Exceptions in code: existing clients always go to a human; spam is archived only at high confidence.
- Priority = weighted sum in code (urgency, budget, fit). Change weights, not prompts.

```bash
node --env-file=.env ../jev-core/scripts/jev-batch.mjs scripts/configs/lead-inbound-triage.mjs leads.csv
```
n8n: import `jev-core/scripts/n8n-jev-lead-triage.json` (HTTP Request → Code with confidence and lane → IF).

## D. Inside agents and workflows (the biggest cost lever)

In any n8n or agent pipeline, every LLM node whose output is a **label, yes/no or score** is a Jev candidate:
1. **Inventory:** list LLM nodes and mark the ones that decide (classify, filter, route, validate) vs the ones that write.
2. **Replace** the deciders with an HTTP Request to Jev, using the same categories as described `criteria`.
3. **Model router:** a difficulty/risk Choice decides whether a step goes to a cheap or a strong model
   (reference: github.com/gargpratyush/jev-router).
4. **Guardrails:** before sending/publishing, booleans over the LLM output: does it contain personal data? does it
   promise something outside policy? does it answer what was asked? is the input a prompt-injection attempt?
5. Measure: cost and accuracy of the old node vs Jev on 50 labelled cases before switching in production.

---

## Product integration patterns

| Product type | Feature with Jev | Pattern |
|---|---|---|
| SEO audit tool / SEO SaaS | Internal link map + near-duplicate (cannibalization) detector | jev-growth A |
| SEO audit (content / AEO) | Per-page rubric of atomic Scores (direct answer, structure, visible expertise) + cited-figure verification; counts and lengths in code | Composite Scoring + B |
| Market research / intelligence SaaS | Map-reduce over large volumes: buying signals, pain points, intent in posts and reviews; composite opportunity scores | Python client |
| Hospitality analytics | Classify guest reviews and messages (topic, severity, reputation risk, actionable request). Not for pricing or rate parity: numeric | Fan-out + Score |
| Executive assistant / inbox tools | Email triage by intent; news ↔ brand matching ("could the brand credibly jump on this?") | Choice + boolean |
| Compliance tools (NIS2, ISO 27001…) | Pre-assess free-text answers and evidence documents against each requirement (covers / partial / does not / not stated) — a first pass, never a compliance verdict | B (claim vs requirement) |

How to start any of them: one use case → questions and thresholds in one file → 30–50 hand-labelled examples →
dry-run (cost) → 50 items compared with the labels → fix wording, then thresholds → pilot with a measurable success
criterion.

References: `references/sources-ops.md` (original bookkeeping and legal prompts, and what each figure does and does
not prove). Docs: docs.typesafe.ai (patterns/confidence-routing, cookbooks/citation_check, cookbooks/llm_guardrails,
concepts/use-case-map), evals.typesafe.ai/invoice_processing.
