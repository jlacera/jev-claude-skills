# Sources and original prompts — bookkeeping and verification

## brochbuilds.com/bookkeeping (written 28 Sept 2026; the source did NOT run it and publishes no code it hasn't run)

- Figures: post by @andywang (x.com/andywang/status/2102265179543400907), 22 Sept 2026. "Did a better job" is his
  claim. Finta (finta.com) says it now uses Jev for its first categorization pass. He offered to open-source the code
  if people bring their own Jev key; he hadn't by 28 Sept.
- Original prompt:

```
Build me a bookkeeping review job using Jev through the Vercel AI Gateway. Read-only: it never writes to my accounting software.

1. Ask me where my books live (a QuickBooks or Xero export, or a CSV from my bank) and pull every transaction: date, amount, vendor, memo, and the category and department my bookkeeper chose.
2. Ask me for my chart of accounts, then pick the 10 or so categories that cover most of my spend.
3. For every transaction make ONE call: experimental_evaluate from the ai package, model typesafe-ai/jev. The state is the transaction as plain text (date, amount, vendor, memo). Ask boolean questions together in that one call:
   - one per candidate category: "This transaction belongs in <category>."
   - investment: "This money is an investment or loan (a SAFE, equity, a note), not revenue."
   - documented: "There is enough information here to categorize this transaction with confidence."
4. The top category is the pick. If "documented" is under 0.50, or the top two categories are within 0.15 of each other, mark it NEEDS A HUMAN instead of guessing.
5. Compare each pick with what my bookkeeper chose. Write review.csv (date, vendor, amount, bookkeeper category, Jev category, confidence, verdict), with disagreements first.
6. Run 3 calls at a time; bursts get rate-limited. Tell me the total cost when it finishes.

Show me the disagreements before anything else. Never change a transaction yourself. I decide what to fix, with my accountant.
```

- Change in `bookkeeping-review.mjs`: the "investment booked as revenue" alert is checked first and fires whether the
  bookkeeper or Jev filed it as revenue (the demo's headline catch was the bookkeeper's mistake).

## brochbuilds.com/legal (written 28 Sept 2026; the source tested neither tool on a real case)

- LegalJev: Jozef, maker of StealthGPT (x.com/jozef_gherman/status/2102424217798996420). No code published.
- Monid: Jasper Li's team (x.com/Jasperli0122/status/2102508674371801497). MIT connector; the legal demo itself isn't
  published as code. Setup per monid.ai/blog/reading-law (untested):

```
set up https://monid.ai/SKILL.md, then use vaquill on monid to answer <your legal question>: cite the section, quote the exact subsection, and link the official source
```

  The demo result is Jev **plus** Vaquill's database through Monid, not Jev alone. Paid per call from a prepaid balance.
- Both are beta research tools, not legal advice. Check every result against the source.
- Original prompt for your own checker:

```
Build me a citation checker for a legal document using Jev through the Vercel AI Gateway. It flags problems for a lawyer to review; it never edits the document.

1. Ask me for the document (a brief or memo, as PDF or text). Pull out every sentence that cites a case, and the case it cites.
2. For each citation, fetch the cited opinion from a free public source (CourtListener has an API) and keep the passages most related to the claim. If the case can't be found at all, flag it NOT FOUND and skip step 3 for it.
3. For each claim make ONE call: experimental_evaluate from the ai package, model typesafe-ai/jev. The state is "CLAIM: <the sentence from my document> / OPINION EXCERPTS: <the passages>". Ask these boolean questions together in that one call:
   - supports: "The opinion excerpts support the claim as written."
   - contradicts: "The opinion excerpts say the opposite of the claim."
   - quote: "Any quotation in the claim appears in the excerpts word for word."
4. Flag a claim if supports is under 0.50, contradicts is over 0.50, or quote is under 0.50. Sort NOT FOUND first, then contradictions, then weak support.
5. Run 3 calls at a time; bursts get rate-limited. Write citations.csv (claim, case, verdict, scores, the excerpt it relied on).

Show me the flags with the excerpt next to each. This is a first pass for a lawyer to check, not legal advice.
```

- Change in `claim-check.mjs`: the verbatim-quote question is only sent when the sentence contains a quotation (regex),
  to avoid the conditional instruction "if there is no quote, answer yes" (indirection is a documented jev-1.13 weak
  spot). Outside the US, replace CourtListener with the official national source (e.g. BOE/CENDOJ in Spain).

## Relevant official docs
- Citation check cookbook: docs.typesafe.ai/cookbooks/citation_check
- Confidence-gated routing: docs.typesafe.ai/patterns/confidence-routing
- Chatbot guardrails: docs.typesafe.ai/cookbooks/llm_guardrails
- Jev vs LLMs on invoice decisions (pay, hold, dispute, escalate): evals.typesafe.ai/invoice_processing
