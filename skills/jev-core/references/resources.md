# Jev — curated resources

Source: brochbuilds.com/jev/resources (133 resources, updated 24 Sept 2026; star counts as of 22 Sept). Selection and
priority for an SEO / growth / automation agency. Before using any repo in production, check its licence, last commit
and code: most are days old with no maintenance guarantee. Demos on X are their authors' claims.

Priority: **A** = usable now in agency services or SaaS · **B** = useful reference · **C** = inspiration.

## SEO, content and marketing

| P | Resource | What it does |
|---|---|---|
| A | github.com/tjkimcloud/jev-site-auditor | Checks every page on a site against brand rules (1,256 pages for 16¢) |
| A | github.com/AgriciDaniel/jev-seo | Full-site SEO audit from one URL; exports PDF/Excel/Markdown |
| A | github.com/epergaboni/jevseo | Scores a page for Google and AI search, returns a ranked fix list |
| A | github.com/prantikmedhi/anchorlint | Checks whether each link's anchor text matches the page it points to |
| A | github.com/RefoundAI/jev-editor-skill | Agent skill that grades blog drafts for AI tells, voice and SEO before publishing |
| A | x.com/borjafat (demo) | Internal-link audit: the basis of the jev-growth recipe |
| B | github.com/kitze/pagegrade | Chrome extension: grades each page section for clarity, writing and SEO |
| B | github.com/stas4000/jev-marketing | 7 workflows: ad tagging, brief scoring, negative keywords, ad fatigue, ad↔landing match |
| B | github.com/Andriy-Kulak/meta-ads-library-analyzer | Tags every live ad of a brand by hook, format, offer and audience |
| B | x.com/TheMattBerman (demo, 1.03M views) | Groups a competitor's whole ad library by angle |
| B | x.com/elvissun (demo) | Reads the news and flags stories a brand could credibly jump on |
| B | github.com/leepokai/jev-adrank | Ranks in-feed ads and reviews creatives in real time |
| B | github.com/superagents-lab/jev-search (412★) | Plain-language web search; Jev picks and ranks sources |
| C | github.com/monteduro/killmyidea | Ten quick questions about an idea: kill it, fix it or ship it |

## Sales and lead generation

| P | Resource | What it does |
|---|---|---|
| A | github.com/integralmarketingmx/jev-latam-lead-triage | **Spanish.** WhatsApp/CRM leads → handle, review or human, with an n8n template |
| A | github.com/bcharleson/jev-gtm-cookbook | 15 outbound recipes: ICP scoring, job-change signals, reply sorting, inbound routing |
| A | github.com/superdesigndev/treg (3.7k★) | Pay-per-use people/company data; Jev judges before paid enrichment. Source-available: self-host for your team, no reselling as a service |
| B | github.com/promptgtm-shared/clay-jev-people-ranker | Pulls prospects from Clay and removes false positives (investors…) before enrichment |
| B | github.com/LiamSherline/jev-lead-scorer | Scores leads, picks an outreach angle, learns which opener books meetings |
| B | github.com/wsmoak/jev-sales-calls | From a discovery call: what they asked for, what blocks the deal, how warm it is |
| B | x.com/romanbuildsaas (demo) | 700 leads + messages scored in 40 s for 9¢ |
| B | ai.joaoqueiros.com (blog) | Rollout plan for lead scoring and inbox routing with review steps |

## Support, triage and moderation

| P | Resource | What it does |
|---|---|---|
| A | github.com/vibe-with-me-tools/n8n-nodes-jev | n8n node for judgment steps; unsure items go to a person |
| A | github.com/khmuhtadin/n8n-nodes-jev-classification | n8n node: one branch per category + "Needs Review" |
| A | github.com/scienthoon/jev-ood-calibration | Independent test: does Jev know when it doesn't know? Read before setting auto-route thresholds |
| B | github.com/CyrilBaah/jev-triage-desk | One call per ticket: team, urgency, spam → person, draft reply or archive |
| B | github.com/enderkus/zammad-jev-dispatcher | Moves tickets to the right team only when Jev is confident |
| B | github.com/ohernandezdev/jevmod | Comment moderation (spam, scams, your own rules) |
| B | github.com/soderlind/jev-comment-triage | WordPress plugin: screens comments and holds the doubtful ones |
| B | github.com/brandonbryant12/transcript-scorecard | Scores a support call against your scorecard as it plays |
| B | github.com/goodrahstar/jev-column-race | 1,000 app reviews labelled (topic, bug, sentiment), raced against Gemini Flash |

## Operations, finance and documents

| P | Resource | What it does |
|---|---|---|
| A | github.com/Cab14bacc/jev-sheets | Google Sheets: `JEV_CHOICE`, `JEV_SCORE`; returns UNSURE when unsure. No code |
| A | github.com/ColinDargent/tri-emails-jev | Sort a shared inbox: Python, n8n, Make or a Claude Code skill (French) |
| B | github.com/jerryjliu/docjev (281★) | Classifies and splits documents; parses PDF/Word locally |
| B | github.com/stas4000/jev-clerk | Reads supplier invoice PDFs and books them |
| B | github.com/distil-labs/invoice-processing-pipeline | Jev triages a finance inbox; a small model handles invoices (197/200) |
| B | github.com/IslamBaraka90/jev-typesafe-real-financial-use-cases | 50 graded finance demos with honest notes on failures |
| B | github.com/sharziki/semdecide | Yes/no decisions for scripts and CI as exit codes |
| B | github.com/TPAteeq/tocsin | Groups logs into patterns, then decides: page, ticket or ignore |
| C | github.com/abinashray008/fraud-classifier | Hard rules first → one Jev risk call → an LLM only for unclear cases |

## Engineering and agents

| P | Resource | What it does |
|---|---|---|
| A | github.com/gargpratyush/jev-router (343★) | Model router for Claude Code/Codex: easy turns to a cheap model, hard ones to a strong one |
| A | github.com/jkudish/jev-mcp (284★) | MCP: verify, screen and rank tools for any agent |
| A | github.com/itsmostafa/typesafe-mcp (258★) | MCP server so any agent can ask Jev a question |
| B | github.com/realZachi/pg-jev (310★) | Postgres extension: `jev()` filters rows with a plain-English condition |
| B | github.com/devagrawal09/jev-review (547★) | Code review that triages a diff |
| B | github.com/tamaratran/fast-jev-compaction (6.3k★) | Claude Code plugin that drops stale context when compacting |
| B | github.com/browser-use/jev-ultrafast (18.1k★) | Web agent where Jev picks every browser step (demo ran in a prepared sandbox) |
| B | github.com/comet-ml/opik (22.2k★) | Open-source LLM monitoring that can trace Jev calls |
| C | github.com/w3cj/jev-chat | Command bar that calls real tools; Jev decides, no LLM writes |

## Official documentation (TypeSafe / Vercel)

- Launch post: typesafe.ai/blog/introducing-system-one-models-and-jev
- Quick start: docs.typesafe.ai/introduction/quickstart · Primitives: docs.typesafe.ai/primitives
- Confidence: docs.typesafe.ai/confidence · Patterns: docs.typesafe.ai/patterns (fan-out, confidence-routing,
  composite-scoring, intent-routing) · Weak spots: docs.typesafe.ai/model-jaggedness/jev-1.13
- Models and pricing: docs.typesafe.ai/models · Use-case map: docs.typesafe.ai/concepts/use-case-map
- Cookbooks: docs.typesafe.ai/cookbooks (citation_check, classifying_rag_passages, entity_alignment,
  date_extraction_cookbook, pre_parsed_value_extraction_cookbook, llm_guardrails, function_calling,
  classification_using_confidence, consistency_choice_cookbook)
- Public evals Jev vs LLMs: evals.typesafe.ai (customer_service, invoice_processing)
- Vercel: vercel.com/kb/guide/typesafe-jev-and-ai-sdk · vercel.com/docs/ai-gateway/modalities/evaluation
- Official skill: github.com/typesafe-ai/skills · SDKs: typesafe-sdk-js, typesafe-sdk-python ·
  system-one-adapter-python (runs the same questions on an LLM so you can compare)
- Question-writing and threshold guide: github.com/dbreunig/building-with-jev-skill · jevify (finds where Jev fits in an
  existing project): github.com/ryana/jevify

## Local alternatives (do not call TypeSafe)

kev (jaredpalmer, trainable decision models on your own hardware), SemIf ("semantic if" on a home GPU or in the
browser), NanoJev (teaching replica with training code), localjev (GitHub Next, local server speaking Jev's API),
simple-jev (Featherless: open models as Jev-style scoring endpoints). Useful for data that cannot leave your own
infrastructure; quality not comparable without testing.

## Community directories

madewithjev.com (X links often wrong), awesomejev.com, github.com/yibie/awesome-jev,
github.com/AbdelStark/awesome-typesafe-jev (includes independent tests).
