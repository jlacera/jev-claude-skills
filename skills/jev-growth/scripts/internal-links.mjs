#!/usr/bin/env node
// internal-links.mjs — Internal link map with Jev. It only READS the site and writes a CSV: it never touches the site.
// Based on the brochbuilds.com/seo recipe (586 pages x 15 destinations = 8,790 decisions for $0.21).
//
//   node --env-file=.env internal-links.mjs --sitemap https://client.com/sitemap.xml --dest destinations.json
//        [--limit 20 | --all] [--floor 0.60] [--gap 0.15] [--max-per-dest 30] [--lang en|es]
//        [--anchors] [--concurrency 3] [--out link-map.csv] [--include REGEX] [--exclude REGEX]
//
// destinations.json: [{ "url": "https://client.com/service-x", "title": "Service X in <city>",
//                       "keywords": ["service x", "x in <city>"] }, ...]   (keywords optional, used for anchors)
//
// Rules that come from real tests (do not change without re-validating):
//  1. ONE call per source page with ALL destinations as questions (not one per pair: 15x the cost).
//  2. Ask about the reader's click, not about "relevance".
//  3. No flat threshold: the top one wins only if >= floor and beats the runner-up by >= gap.
//  4. Cap per destination so one money page does not absorb every link.
//  5. The anchor is chosen among phrases ALREADY on the page. It is never invented.

import { readFileSync, writeFileSync } from 'node:fs';
import * as h from '../../jev-core/scripts/jev-client.mjs';

const BOOL = new Set(['all', 'anchors']);
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); opt[k] = BOOL.has(k) ? true : argv[++i]; }

if (!opt.sitemap || !opt.dest) {
  console.error('Usage: node --env-file=.env internal-links.mjs --sitemap URL --dest destinations.json [--limit 20|--all] [--anchors] [--lang en|es]');
  process.exit(1);
}

const DESTINATIONS = JSON.parse(readFileSync(opt.dest, 'utf8'));
const numOpt = (k, def) => { const v = Number(opt[k] ?? def); if (!Number.isFinite(v) || v < 0) { console.error(`--${k} must be a number`); process.exit(1); } return v; };
const FLOOR = numOpt('floor', 0.6);
const MIN_GAP = numOpt('gap', 0.15);
const MAX_PER_DEST = numOpt('max-per-dest', 30);
const LIMIT = opt.all ? Infinity : numOpt('limit', 20);
const CONCURRENCY = Math.max(1, numOpt('concurrency', 3));
const OUT = opt.out ?? 'link-map.csv';
const LANG = opt.lang ?? 'en';
const INCLUDE = opt.include ? new RegExp(opt.include, 'i') : null; // e.g. only one language: --exclude '/en/'
const EXCLUDE = opt.exclude ? new RegExp(opt.exclude, 'i') : null; // e.g. legal pages: --exclude 'privacy|legal|contact'

// The English wording is the validated one (it ranked correctly in the test). Other languages: A/B it first.
const QUESTION = {
  en: (t) => `A reader who finishes this page still needs "${t}". Would they click it and find what they came for?`,
  es: (t) => `Un lector que termina esta página todavía necesita "${t}". ¿Haría clic en ese enlace y encontraría lo que busca?`,
}[LANG];
if (!QUESTION) { console.error('--lang must be en or es'); process.exit(1); }

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; JevLinkAudit/1.0)' };
const norm = (u) => { try { const x = new URL(u); x.hash = ''; x.search = ''; return x.href.replace(/\/$/, '').toLowerCase(); } catch { return u; } };

async function sitemapUrls(url, depth = 0) {
  const xml = await (await fetch(url, { headers: UA })).text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => h.decodeEntities(m[1]));
  if (/<sitemapindex/i.test(xml) && depth < 2) {
    const nested = [];
    for (const l of locs) nested.push(...(await sitemapUrls(l, depth + 1)));
    return nested;
  }
  return locs.filter((u) => !/\.(pdf|jpe?g|png|webp|gif|svg|zip|xml)$/i.test(u));
}

async function loadPage(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const title = h.decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? url);
  // Only links in the main content count as "already linked": menu/footer links are not contextual.
  const region = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    html.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');
  const hrefs = new Set([...region.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => { try { return norm(new URL(m[1], url).href); } catch { return ''; } }));
  return { url, title, body: h.truncate(h.stripHtml(html)), hrefs };
}

// ---- 1. Crawl ----
const bareHost = (u) => new URL(u).host.replace(/^www\./, ''); // www and apex count as the same site
const host = bareHost(opt.sitemap);
const all = (await sitemapUrls(opt.sitemap)).filter((u) => { try { return bareHost(u) === host && (!INCLUDE || INCLUDE.test(u)) && (!EXCLUDE || !EXCLUDE.test(u)); } catch { return false; } });
const sources = [...new Set(all)].slice(0, LIMIT);
console.error(`Sitemap: ${all.length} URLs · processing ${sources.length} · destinations: ${DESTINATIONS.length}`);
const pages = (await h.pool(sources, 4, loadPage)).filter((p) => p && !p.__error && p.body.length > 200);

// ---- 2. One call per page, every destination at once ----
const destIdx = DESTINATIONS.map((d, i) => ({ ...d, key: 'd' + i, n: norm(d.url) }));
const skipped = { noCandidates: 0, alreadyLinked: 0, noWinner: 0 };
const signatures = new Map();

const judged = await h.pool(pages, CONCURRENCY, async (page) => {
  const self = norm(page.url);
  const candidates = destIdx.filter((d) => d.n !== self && !page.hrefs.has(d.n)); // not to itself, not already linked
  skipped.alreadyLinked += destIdx.filter((d) => page.hrefs.has(d.n)).length;
  if (!candidates.length) { skipped.noCandidates++; return null; }

  const { answers } = await h.evaluate({
    state: `TITLE: ${page.title} -- ${page.body}`,
    questions: Object.fromEntries(candidates.map((d) => [d.key, { type: 'boolean', instructions: QUESTION(d.title) }])),
  });
  const ranked = h.rankBooleans(answers);
  if (ranked.length >= 3 && ranked.filter((r) => r.p >= 0.1).length >= 3) { // avoids false duplicates made of zeros
    const sig = ranked.map((r) => `${r.key}:${r.p.toFixed(3)}`).sort().join('|');
    signatures.set(sig, [...(signatures.get(sig) || []), page.url]);
  }

  const pick = h.pickWithGap(ranked, { floor: FLOOR, minGap: MIN_GAP });
  if (!pick.winner) { skipped.noWinner++; return null; }
  const d = destIdx.find((x) => x.key === pick.winner);
  return { page, dest: d, p: pick.top.p, runnerUp: pick.next ? destIdx.find((x) => x.key === pick.next.key).url : '', runnerUpP: pick.next?.p ?? '', gap: pick.gap };
});

// ---- 3. Cap per destination ----
const perDest = new Map();
const kept = judged.filter((r) => r && !r.__error).sort((a, b) => b.p - a.p).filter((r) => {
  const c = perDest.get(r.dest.url) || 0;
  if (c >= MAX_PER_DEST) return false;
  perDest.set(r.dest.url, c + 1);
  return true;
});

// ---- 4. Anchor: choose among phrases already on the page ----
const STOP = new Set('with that this from your what when where which their there they have will about into more than also para como sobre desde entre hasta esta este estos estas pero porque cuando donde todo todos cada otra otro unas unos'.split(' '));
function anchorCandidates(body, dest) {
  const kws = (dest.keywords?.length ? dest.keywords : dest.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w)))
    .map((k) => k.toLowerCase());
  const tokens = body.split(/\s+/);
  const lower = tokens.map((t) => t.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, ''));
  const out = new Set();
  for (const kw of kws) {
    const kwT = kw.split(/\s+/);
    for (let i = 0; i <= lower.length - kwT.length && out.size < 40; i++) {
      if (kwT.every((w, j) => lower[i + j] === w)) {
        for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]]) {
          const s = Math.max(0, i - a), e = Math.min(tokens.length, i + kwT.length + b);
          const phrase = tokens.slice(s, e).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
          if (phrase.split(/\s+/).length <= 8 && phrase.length >= 4) out.add(phrase);
        }
      }
    }
  }
  return [...out].slice(0, 25);
}

if (opt.anchors) {
  await h.pool(kept, CONCURRENCY, async (r) => {
    const phrases = anchorCandidates(r.page.body, r.dest);
    if (!phrases.length) { r.anchor = ''; r.anchorNote = 'no candidate phrase on the page: write the anchor by hand'; return; }
    const criteria = Object.fromEntries(phrases.map((p, i) => ['a' + i, p]));
    criteria.none = 'None of these phrases would read naturally as a link to that page';
    const { answers } = await h.evaluate({
      state: { source_page_title: r.page.title, link_destination: r.dest.title },
      questions: { anchor: { type: 'choice', instructions: 'Which phrase from the source page should carry the link to `link_destination`, so the reader knows exactly where it goes?', criteria } },
    });
    const a = answers.anchor;
    const conf = h.choiceConfidence(a?.probabilities);
    r.anchor = a?.choice && a.choice !== 'none' && conf >= 0.3 ? criteria[a.choice] : '';
    r.anchorConf = conf;
    r.anchorNote = r.anchor ? '' : 'no clear anchor: choose by hand';
  });
}

// ---- 5. Output ----
const rows = kept.map((r) => ({ from: r.page.url, to: r.dest.url, probability: r.p, runner_up: r.runnerUp, runner_up_p: r.runnerUpP, gap: r.gap, anchor: r.anchor ?? '', anchor_confidence: r.anchorConf ?? '', note: r.anchorNote ?? '' }));
h.writeCSV(OUT, rows);

const dupes = [...signatures.values()].filter((g) => g.length > 1);
if (dupes.length) {
  writeFileSync(OUT.replace(/\.csv$/, '') + '.possible-duplicates.txt', dupes.map((g) => g.join('\n')).join('\n\n') + '\n');
  console.error(`WARNING: ${dupes.length} groups of pages with identical scores -> likely near-duplicates (cannibalization). See *.possible-duplicates.txt`);
}
console.log(`${rows.length} proposed links -> ${OUT}`);
console.error(`Skipped: ${JSON.stringify(skipped)} · cap per destination: ${MAX_PER_DEST}`);
h.report('internal-links');
console.error('Nothing on the site was changed. Review the CSV before inserting a single link.');
