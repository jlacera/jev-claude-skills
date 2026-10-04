// bookkeeping-review.mjs — A second opinion on transaction categorization. READ-ONLY: it never writes to your ledger.
// Pattern from @andywang's demo (brochbuilds.com/bookkeeping): judge everything, flag what isn't documented.
// Starting thresholds NOT run by the source: validate them on a month you already know is right.
//
//   node --env-file=.env ../../jev-core/scripts/jev-batch.mjs configs/bookkeeping-review.mjs transactions.csv --dry-run
//
// Expected columns: date, amount, vendor|counterparty, memo|description, category (the one your bookkeeper chose)
// The amount is passed as text for context only: Jev does NOT do arithmetic (sums, date comparisons) -> that is code.

// EDIT: the ~10 accounts that cover most of your spend (key = short name, value = clear description).
// Keys must match the "category" column of your export for the comparison to work.
const CATEGORIES = {
  software: 'Software subscriptions, SaaS tools, hosting, domains',
  advertising: 'Advertising and paid media: Google Ads, Meta Ads, LinkedIn Ads',
  professional_services: 'Freelancers, consultants, lawyers, accountants, subcontracted services',
  utilities: 'Electricity, water, internet, phone lines',
  rent: 'Office or premises rent',
  travel: 'Travel, transport, hotels, meals while travelling',
  office_supplies: 'Office supplies and small equipment below the capitalisation threshold',
  bank_fees: 'Bank fees and payment processor commissions',
  revenue: 'Revenue from customers for products or services delivered',
  other: 'None of the categories above clearly applies',
};

export default {
  name: 'bookkeeping-review',
  state: (r) => [
    `date: ${r.date ?? r.fecha ?? ''}`,
    `amount: ${r.amount ?? r.importe ?? ''}`,
    `counterparty: ${r.vendor ?? r.counterparty ?? r.proveedor ?? ''}`,
    `memo: ${r.memo ?? r.description ?? r.descripcion ?? ''}`,
  ].join('\n'),
  questions: {
    ...Object.fromEntries(Object.entries(CATEGORIES).map(([k, d]) => ['cat_' + k, { type: 'boolean', instructions: `This transaction belongs in: ${d}.` }])),
    investment: { type: 'boolean', instructions: 'This money is an investment, capital contribution or loan (equity, SAFE, convertible note, bank loan), not revenue.' },
    documented: { type: 'boolean', instructions: 'There is enough information here to categorize this transaction with confidence.' },
  },
  decide: (a, r, h) => {
    const ranked = h.rankBooleans(a, Object.keys(CATEGORIES).map((k) => 'cat_' + k));
    const [top, next] = ranked;
    const pick = top ? top.key.replace('cat_', '') : '';
    const documented = h.prob(a.documented), investment = h.prob(a.investment);
    const bookkeeper = String(r.category ?? r.categoria ?? '').trim();
    const bk = bookkeeper.toLowerCase();
    let verdict;
    // The alert goes first: an investment booked as revenue (by the bookkeeper or by Jev) always rises to the top.
    if (investment >= 0.6 && (bk === 'revenue' || pick === 'revenue')) verdict = 'ALERT: investment booked as revenue?';
    else if (!top || documented < 0.5 || (next && top.p - next.p < 0.15)) verdict = 'NEEDS A HUMAN';
    else if (bk && bk !== pick) verdict = 'DISAGREE';
    else verdict = 'AGREE';
    return {
      verdict, date: r.date ?? r.fecha, vendor: r.vendor ?? r.counterparty ?? r.proveedor, amount: r.amount ?? r.importe,
      bookkeeper_category: bookkeeper, jev_category: pick, p_top: top?.p ?? '', gap: top ? (next ? top.p - next.p : top.p) : '',
      documented, investment,
    };
  },
  // Alerts and disagreements first: that is what you take to your accountant.
  sort: (x, y) => rank(x.verdict) - rank(y.verdict),
  columns: ['verdict', 'date', 'vendor', 'amount', 'bookkeeper_category', 'jev_category', 'p_top', 'gap', 'documented', 'investment'],
};
const rank = (v) => (v.startsWith('ALERT') ? 0 : v === 'DISAGREE' ? 1 : v === 'NEEDS A HUMAN' ? 2 : 3);
