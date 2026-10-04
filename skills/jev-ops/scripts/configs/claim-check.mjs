// claim-check.mjs — Does the source support the claim as written?
// LegalJev/Monid pattern (brochbuilds.com/legal), generalised: legal citations, figures in AEO/GEO content,
// numbers in client reports, an LLM's answers vs their RAG context, advertising claims.
// It only flags problems for human review; it never rewrites. 0.50 bars are unvalidated starting points.
//
//   node --env-file=.env ../../jev-core/scripts/jev-batch.mjs configs/claim-check.mjs claims.jsonl --all
//
// Each row: { claim, source, excerpts }  (excerpts = the source passages MOST related to the claim, retrieved in code)
// If the source can't be found, leave excerpts empty: it is marked NOT FOUND in code, without spending a call.
// That is the loudest flag and it needs no model.

export default {
  name: 'claim-check',
  skip: (r) => (String(r.excerpts ?? '').trim() ? null
    : { verdict: 'NOT FOUND', claim: r.claim, source: r.source, supports: '', contradicts: '', quote: '', excerpt: '' }),
  state: (r) => `CLAIM: ${r.claim}\n\nSOURCE: ${r.source ?? ''}\nSOURCE EXCERPTS: ${r.excerpts}`,
  // The verbatim-quote question is only asked when there is a quotation: detecting it is code's job, not the model's.
  questions: (r) => ({
    supports: { type: 'boolean', instructions: 'The source excerpts support the claim as written.' },
    contradicts: { type: 'boolean', instructions: 'The source excerpts say the opposite of the claim.' },
    ...(hasQuote(r.claim) && { quote: { type: 'boolean', instructions: 'The quotation in the claim appears in the source excerpts word for word.' } }),
  }),
  decide: (a, r, h) => {
    const s = h.prob(a.supports), c = h.prob(a.contradicts), q = a.quote ? h.prob(a.quote) : 1;
    const verdict = ![s, c, q].every(Number.isFinite) ? 'REVIEW'
      : c > 0.5 ? 'CONTRADICTS'
      : q < 0.5 ? 'QUOTE NOT VERBATIM'
      : s < 0.5 ? 'WEAK SUPPORT'
      : 'OK';
    return { verdict, claim: r.claim, source: r.source, supports: s, contradicts: c, quote: q, excerpt: String(r.excerpts ?? '').slice(0, 300) };
  },
  sort: (x, y) => ORDER.indexOf(x.verdict) - ORDER.indexOf(y.verdict),
  columns: ['verdict', 'claim', 'source', 'supports', 'contradicts', 'quote', 'excerpt'],
};
const hasQuote = (t) => /["“”«»][^"“”«»]{8,}["“”«»]/.test(String(t ?? ''));
const ORDER = ['REVIEW', 'NOT FOUND', 'CONTRADICTS', 'QUOTE NOT VERBATIM', 'WEAK SUPPORT', 'OK'];
