#!/usr/bin/env node
// find-buyers.mjs — Finds posts by people who want to buy what you sell. It only builds a list: it never replies or sends.
// Based on brochbuilds.com/prospect (real test: 0 buyers in 40 "cold email" comments; 6 of 30 in Ask HN posts about CRMs).
//
// Source A, Hacker News (free API):
//   node --env-file=.env find-buyers.mjs --product "a CRM for a small sales team" --search "CRM" [--days 30]
// Source B, any export of your own (LinkedIn, forums, Reddit, X, forms...) as CSV/JSON/JSONL with url,text columns:
//   node --env-file=.env find-buyers.mjs --product "a local SEO agency for a small business" --file posts.csv
//
// Options: --keep 0.60  --vendor-max 0.50  --concurrency 3  --limit 30  --out leads.csv

import * as h from '../../jev-core/scripts/jev-client.mjs';

const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];

const PRODUCT = opt.product;
if (!PRODUCT || (!opt.search && !opt.file)) {
  console.error('Usage: find-buyers.mjs --product "what you sell, in one sentence" (--search "term" | --file posts.csv)');
  process.exit(1);
}
const KEEP = Number(opt.keep ?? 0.6), VENDOR_MAX = Number(opt['vendor-max'] ?? 0.5);
const LIMIT = Number(opt.limit ?? 30), OUT = opt.out ?? 'leads.csv';
const CONCURRENCY = Math.max(1, Number(opt.concurrency ?? 3) || 3);

// Search where people ASK (Ask HN, "which tool should I use for...?"), not where they MENTION the topic.
async function fromHN() {
  const since = Math.floor(Date.now() / 1000) - Number(opt.days ?? 3650) * 86400;
  const res = await fetch('https://hn.algolia.com/api/v1/search?tags=ask_hn&hitsPerPage=' + LIMIT +
    '&numericFilters=created_at_i>' + since + '&query=' + encodeURIComponent(opt.search));
  return (await res.json()).hits.map((x) => ({
    url: 'https://news.ycombinator.com/item?id=' + x.objectID,
    text: h.decodeEntities((x.title + ' -- ' + (x.story_text ?? '')).replace(/<[^>]+>/g, ' ')).slice(0, 6000),
  }));
}
const posts = opt.file ? h.readTable(opt.file).slice(0, LIMIT).map((r) => ({ url: r.url, text: String(r.text ?? '').slice(0, 6000) })) : await fromHN();

// The three questions that do all the filtering. One call per post.
const questions = {
  buying: { type: 'boolean', instructions: `The author is actively looking for ${PRODUCT} right now, and would welcome a reply offering one.` },
  pain: { type: 'boolean', instructions: 'The author describes a problem they personally have today.' },
  vendor: { type: 'boolean', instructions: 'The author is promoting or selling their own product or service.' },
};

const scored = await h.pool(posts.filter((p) => p.text.trim()), CONCURRENCY, async (p) => {
  const { answers } = await h.evaluate({ state: p.text, questions });
  return { ...p, buying: h.prob(answers.buying), pain: h.prob(answers.pain), vendor: h.prob(answers.vendor) };
});

const ok = scored.filter((p) => !p.__error);
const leads = ok
  .filter((p) => p.buying >= KEEP && p.vendor < VENDOR_MAX) // sellers mention the same words: drop them
  .sort((a, b) => b.buying - a.buying || b.pain - a.pain);   // pain sorts when there are more leads than time

h.writeCSV(OUT, leads.map(({ url, buying, pain, vendor, text }) => ({ url, buying, pain, vendor, excerpt: text.slice(0, 200) })));
console.log(`${leads.length} of ${ok.length} posts are buyers -> ${OUT}`);
h.report('find-buyers');
console.error('Nothing was sent. Read each post and answer the question they actually asked, following each platform\'s rules.');
