// lead-inbound-triage.mjs — Classifies inbound leads (web form, WhatsApp, email) and picks a lane:
// auto (template reply / queue), review, human. Confidence-Gated Routing + Speculative Fan-Out patterns.
// Inspired by integralmarketingmx/jev-latam-lead-triage and docs.typesafe.ai/patterns.
//
//   node --env-file=.env ../../jev-core/scripts/jev-batch.mjs configs/lead-inbound-triage.mjs leads.csv
// Columns: message, name, company, email, channel

// EDIT: your real services. Always keep an "other" option.
const INTENTS = {
  quote_seo: 'Wants a quote or proposal for SEO, local SEO, AEO/GEO or search visibility',
  quote_web: 'Wants a new website, a redesign or web development',
  automation: 'Wants automation, AI agents, n8n workflows or software integrations',
  existing_client: 'Existing client asking about an ongoing project, invoice or support',
  vendor_spam: 'Someone selling their own services, link-building offers, guest posts or spam',
  job: 'Job application or internship request',
  other: 'Anything that does not fit the options above',
};
// EDIT: the market you serve.
const MARKET = process.env.MARKET || 'Spain';

const get = (r, ...k) => k.map((x) => r[x]).find((v) => v !== undefined && v !== '') ?? '';

export default {
  name: 'lead-inbound-triage',
  state: (r) => ({ channel: get(r, 'channel', 'canal'), company: get(r, 'company', 'empresa'), message: get(r, 'message', 'mensaje') }),
  // Speculative fan-out: ask everything at once, even what only matters for some leads.
  questions: {
    intent: { type: 'choice', instructions: 'What is the main request in `message`?', criteria: INTENTS },
    urgency: { type: 'score', instructions: 'How time-sensitive is the request in `message`?', criteria: ['No time pressure mentioned', 'Wants to start in the coming weeks', 'Needs it now or has a fixed near deadline'] },
    budget: { type: 'boolean', instructions: '`message` mentions a budget, a price range or asks for prices.' },
    in_market: { type: 'boolean', instructions: `The sender appears to be a business operating in ${MARKET}.` },
  },
  decide: (a, r, h) => {
    const conf = h.confidenceOf(a.intent);
    const intent = a.intent?.choice;
    let lane = h.confidenceLane(conf, { high: 0.85, low: 0.6 });
    if (intent === 'existing_client') lane = 'human';                 // never automate existing clients
    if (intent === 'vendor_spam' && conf >= 0.85) lane = 'archive';
    const priority = (a.urgency?.score ?? 0) / 2 * 0.5 + h.prob(a.budget) * 0.3 + h.prob(a.in_market) * 0.2; // weights in code
    return { lane, intent, confidence: conf, priority, urgency: a.urgency?.score, name: get(r, 'name', 'nombre'), company: get(r, 'company', 'empresa'), email: r.email, message: String(get(r, 'message', 'mensaje')).slice(0, 200) };
  },
  sort: (x, y) => y.priority - x.priority,
  columns: ['lane', 'intent', 'confidence', 'priority', 'urgency', 'name', 'company', 'email', 'message'],
};
