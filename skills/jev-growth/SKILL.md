---
name: jev-growth
description: Growth recipes built on Jev (TypeSafe AI's cheap decision model) for SEO and B2B agencies - automated SEO internal linking (one call per page, reader-click question, gap rule, anchors chosen from on-page text, near-duplicate detection), finding prospects who are ready to buy in public posts (buying, pain and vendor questions), checking every outreach message for fit and reply before it is sent, and Clay-style ICP lead lists that judge companies before paying to enrich them (Treg pattern). Use when the user asks for internal links, a link map, cannibalization, prospecting, buying intent, outreach or cold email review, ICP lists, enrichment, Clay, Apollo or Treg, or wants any of these as a feature in an SEO audit tool or SaaS. Requires jev-core.
---

# Jev — growth (level 2: SEO and lead generation)

Requires **jev-core** (access, request shape, golden rules, thresholds). Here: four recipes, tested or documented with
public figures. They all share one move:
**one item = one state; all questions in one call; the decision in code; a human approves.**

Scripts: bundled in the `jev-skills` plugin (this skill's `scripts/` + `jev-core/scripts/`). If they are not
installed, generate them from the prompts and rules in this skill.

Shared guardrail: read-only. No recipe inserts links, publishes, sends emails/DMs or connects with anyone.
First 20 items → CSV → review → "go".

---

## A. SEO internal linking

**Reference figures** (public demo by @borjafat, 18 Sept 2026): 586 source pages × 15 destinations = 8,790 decisions
for **$0.21**. Ben Broch's own test: 13 real posts for ~0.1 cents.

### Design (every point comes from a real mistake)
1. **Crawl** the sitemap: title + body of every URL (body trimmed to ~24k characters).
2. **Short destination list**: only the pages that should receive links (services, money pages, pillars). Few
   destinations = cheap, and a link map that looks editorial rather than automated. Ask for them before starting.
3. **One call per source page**, one boolean per destination. Never per pair (15× the cost, same answer).
4. **Question wording (tested on 13 pages, same model):**
   - "Would a link to X help, rather than merely share a topic?" → zero usable links and a random country page above
     the obvious explainer.
   - "This page leaves something unanswered that X answers." → five links, **ranked wrong** (confident and incorrect:
     the dangerous one).
   - ✅ `A reader who finishes this page still needs "X". Would they click it and find what they came for?`
5. **Gap rule, not a fixed threshold.** A flat 0.75 produced **zero** links even though the model was right:
   ```
   0.700  /what-is-idp          <- correct, and decisive
   0.410  /idp-requirements/japan
   0.390  /idp-requirements/italy
   ```
   Keep the winner only if it is **≥ 0.60** and beats the runner-up by **≥ 0.15**. A tie to the hundredth = noise = no link.
6. **Caps**: per source page (the rule already keeps one) and per destination (e.g. 30), or one money page quietly
   absorbs every link on the site.
7. **Anchor in a second, cheaper pass:** a Choice among phrases that **already exist** on the source page (+ a "none"
   option). Never let the model invent the anchor: that is the difference between a link that reads hand-written and
   one that reads like software.
8. **Exclude** self-links and destinations the page already links **in its content** (menu/footer links don't count).
9. **Scores identical to three decimals across pages** = near-duplicates (4 of 13 in the test). No linking strategy
   fixes that: it is cannibalization → a separate finding for the client.

### Run
```bash
# destinations.json: [{ "url": "...", "title": "Local SEO in <city>", "keywords": ["local seo", "google maps"] }]
node --env-file=.env scripts/internal-links.mjs --sitemap https://client.com/sitemap.xml --dest destinations.json --anchors
#   --limit 20 by default · --all after review · --lang es to A/B a Spanish wording against the English one
```
Output: `link-map.csv` (from, to, probability, runner_up, runner_up_p, gap, anchor, anchor_confidence, note) +
`*.possible-duplicates.txt`.

### Prompt for an agent to build it (original from brochbuilds.com/seo)
```
Build me an internal linking job for my site using Jev through the Vercel AI Gateway.

1. Crawl my sitemap and pull each page's title and body text. Trim each body to roughly 24k characters; Jev's state budget is 32k tokens.
2. I will give you the handful of destination pages I want links pointing at. Ask me for them before you start.
3. For every source page make ONE call: experimental_evaluate from the ai package, model typesafe-ai/jev, the page as the state, and one boolean question per destination. Never one call per pair — that re-sends the whole page body for every destination and costs about 15x for an identical answer.
4. Word each question about the reader's next move, not about relevance: "A reader who finishes this page still needs X. Would they click it and find what they came for?" Asking whether a link would be "helpful" or "relevant" reads as topic-matching and ranks badly.
5. Do not use a flat probability threshold. Rank the destinations per page, then keep the winner only if it beats the runner-up by at least 0.15 and clears 0.60 on its own. If the top two are a hundredth apart that is noise, and the page gets no link.
6. Write a CSV of from, to, probability. Do the first 20 pages only, then stop and show me the CSV.
7. Do not edit my site, do not publish anything, and do not insert a single link until I have read it and said go.
```
Additions in `internal-links.mjs` (they do not change the validated question or rule): sitemap indexes, `<main>` /
`<article>` extraction, exclusion of destinations already linked in the content, per-destination cap, anchor pass,
near-duplicate report, runner-up and gap columns, pooled calls with retries.

### Cost
`$0.2111 / $0.042 per M = 5.03 M tokens; 5.03 M / 586 calls = 8,577 tokens per call` → one page body + 15 short
questions per call. Per pair: 75.4 M tokens, $3.17. A 500-URL client site with 20 destinations: ~$0.20.
The demo's frontier-model comparison is an extrapolation from a partial run (21 of 586 pages); "190× cheaper" is per
page, ~204× on total cost. Don't mix the two.

---

## B. Prospects who are ready to buy

**Public figures:** @tarasshyn, 1,759,932 posts in 53 s for $0.65. Broch's tests: the 40 latest Hacker News comments
containing "cold email" → **0 buyers** (top score 0.12); 30 Ask HN posts about CRMs → **6 buyers**, all choosing a CRM.

1. **Search where people ASK, not where they TALK** (this matters more than the model): "which agency/tool would you
   recommend for…?", recommendation threads, founder groups, Ask HN, niche forums.
2. One call per post, three booleans:
   - **buying**: `The author is actively looking for <what you sell> right now, and would welcome a reply offering one.`
   - **pain**: `The author describes a problem they personally have today.`
   - **vendor**: `The author is promoting or selling their own product or service.`
3. Keep a post if **buying ≥ 0.60 and vendor < 0.50**. `pain` is the sort order when you have more leads than time.
4. **The vendor question is the one people skip:** without it every "we built a tool for this" post floods the top.
   In the tests it caught a job ad, a hiring post and a product launch, and correctly passed on people *building* a
   CRM or wanting a *personal* one: mentioning the thing is not wanting to buy it from you.
5. A pool of 3 calls; 40 at once returned "high demand".

```bash
node --env-file=.env scripts/find-buyers.mjs --product "a local SEO agency for a small business" --file posts.csv
node --env-file=.env scripts/find-buyers.mjs --product "a CRM for a small sales team" --search "CRM" --days 30   # HN
```

## C. Check every message before it goes

**Public figures:** @romanbuildsaas, 700 leads + personalised messages scored in 40 s for $0.09.
State = `LEAD: <who they are> / MESSAGE THEY ARE ABOUT TO RECEIVE: <message>`; two booleans in one call:
- **reply**: `This person would reply to this message.`
- **fit**: `This message was written for someone in this person's role, with this person's problem.`

| reply | fit | verdict |
|---|---|---|
| 0.66 | 0.90 | Send — Head of Sales, SDRs drowning in account research |
| 0.17 | 0.08 | Wrong person — backend engineer, **same message** |
| 0.19 | 0.32 | Wrong person — VP Marketing, "Hi {first_name}, I help companies grow" |

Rules: **fit < 0.50** → don't send (right message, wrong person: the silent mail-merge mistake at scale);
**fit fine, reply < 0.50** → rewrite and score again (a fraction of a cent); **both clear** → send it yourself;
missing answer → review. Generic templates score low on fit for everyone: that is the point. Three hand-written pairs
are a sanity check, not a benchmark: calibrate against your own campaigns' reply data before trusting a threshold.

```bash
node --env-file=.env scripts/check-messages.mjs outreach.json     # [{ "lead": "...", "message": "..." }]
```

## D. Clay-style ICP lists: judge first, pay second

**Public figures** (Treg launch, @jasonzhou1993, 23 Sept 2026; vendor claims): "Find head of growth at Series-A startup
in SF" → 320 candidates screened in 37.2 s, 96 kept, ~1 cent of scanning; "$0.0089 a lead", "85% cheaper than Clay".
Treg: github.com/superdesigndev/treg (source-available: self-host for your own team, not resell as a service; $1 of
starter credit). Untested by the source and by us.

Principle: finding a person and verifying an email costs money on every row; asking Jev whether a company fits costs
a tiny fraction. **Jev throws out the wrong companies using the free fields; you only pay to enrich the ones that pass.**

One call per company (state = name, description, industry, headcount, location):
- **fit**: `This company matches: <your ICP in one sentence>.`
- **b2b**: `This company sells mainly to other businesses, not to consumers.`
- **agency**: `This company is a marketing, web or consulting agency, not a company that would hire one.`

(b2b and agency are **adapted** for an agency selling services; the guide's originals: "This company sells to other
businesses, not to consumers." and "This company is an agency or consultancy, not a product company." Test both.)

Keep if fit ≥ 0.60, b2b ≥ 0.60 and agency < 0.50 (unvalidated starting points). Grey zone → human review.

```bash
node --env-file=.env ../jev-core/scripts/jev-batch.mjs scripts/configs/icp-company-fit.mjs companies.csv --dry-run
ICP="A company in <region> with 10 to 250 employees that sells to other businesses and needs to win customers online" \
node --env-file=.env ../jev-core/scripts/jev-batch.mjs scripts/configs/icp-company-fit.mjs companies.csv --limit 50
```

Install (from the Treg README, untested): `curl -fsSL https://treg.to/install.sh | sh` (read the script first),
`treg login`, `treg catalog search "find work email for a person"`, `treg balance`; or as a Claude Code plugin:
`/plugin marketplace add superdesigndev/treg` → `/plugin install treg@treg`.

Prospecting (B) finds people **asking** for what you sell; ICP (D) builds a list of people who **fit**. Most teams
want both.

---

## Compliance (EU/UK)

A list is not permission. Unsolicited commercial email in the EU needs a lawful basis under GDPR plus national
e-privacy rules (e.g. Spain's LSSI art. 21); every platform (LinkedIn, Reddit, X, WhatsApp) has its own rules. A buying
signal is an invitation to be useful, not a licence to spam: read the post, answer the question they asked, send by
hand. Check your approach with legal counsel before campaigns at scale. Send Jev only the personal data the decision
needs (ZDR on).

## Product integration ideas

- **SEO audit tools / SaaS:** recipe A as an "internal link map" module + a near-duplicate (cannibalization) report.
  Marginal cost per audit < $1 on small-business sites.
- **Agency lead generation:** D on your company database before any paid enrichment; C on every sequence before it
  goes out; B on sources where small businesses ask for agency or web recommendations.
- n8n: the same questions via HTTP Request (template in `jev-core/scripts/n8n-jev-lead-triage.json`).

Sources: brochbuilds.com/seo (tested 21 Sept 2026), /prospect (tested 24 Sept), /leads (written 28 Sept, untested).
Headline figures are third-party public demos; the source's own tests are small. With clients, separate your own data,
third-party data and hypotheses.
