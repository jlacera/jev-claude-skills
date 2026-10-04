// icp-company-fit.mjs — "Judge first, pay second" (Treg pattern, brochbuilds.com/leads).
// Screens companies against your ICP using the FREE list fields before paying for enrichment (email, phone).
//
//   node --env-file=.env ../../jev-core/scripts/jev-batch.mjs configs/icp-company-fit.mjs companies.csv --dry-run
//   node --env-file=.env ../../jev-core/scripts/jev-batch.mjs configs/icp-company-fit.mjs companies.csv --limit 50
//
// Expected columns (whichever exist): name|company, description|activity, industry|sector, employees, location|city, web
// Starting thresholds (not validated on your data): fit >= 0.60, b2b >= 0.60, agency < 0.50.
// Questions ADAPTED from brochbuilds.com/leads for an agency selling services (originals: "This company sells to other
// businesses, not to consumers." and "This company is an agency or consultancy, not a product company."). Test both.

// EDIT: your ICP in one plain sentence (or pass ICP="..." in the environment).
const ICP = process.env.ICP ||
  'A company with roughly 10 to 250 employees that sells to other businesses and depends on being found online by new customers';

const pick = (row, ...keys) => keys.map((k) => row[k]).find((v) => v !== undefined && v !== '') ?? '';
const NAME = ['name', 'company', 'nombre', 'empresa'];

export default {
  name: 'icp-company-fit',
  // Only what the decision needs: noise in the state costs accuracy.
  state: (row) => ({
    name: pick(row, ...NAME),
    description: pick(row, 'description', 'activity', 'descripcion', 'actividad'),
    industry: pick(row, 'industry', 'sector', 'cnae'),
    employees: pick(row, 'employees', 'headcount', 'empleados'),
    location: pick(row, 'location', 'city', 'region', 'provincia', 'ciudad'),
  }),
  questions: {
    fit: { type: 'boolean', instructions: `This company matches: ${ICP}.` },
    b2b: { type: 'boolean', instructions: 'This company sells mainly to other businesses, not to consumers.' },
    // Same job as the "vendor" question in prospecting: removes companies that look like a fit but never buy.
    agency: { type: 'boolean', instructions: 'This company is a marketing, web or consulting agency, not a company that would hire one.' },
  },
  decide: (a, row, h) => {
    const fit = h.prob(a.fit), b2b = h.prob(a.b2b), agency = h.prob(a.agency);
    const keep = fit >= 0.6 && b2b >= 0.6 && agency < 0.5;
    const near = !keep && fit >= 0.5 && agency < 0.5; // grey zone: cheap human review
    return {
      decision: keep ? 'ENRICH' : near ? 'REVIEW' : 'DISCARD',
      company: pick(row, ...NAME),
      web: pick(row, 'web', 'website', 'url'),
      fit, b2b, agency,
    };
  },
  sort: (x, y) => ORDER.indexOf(x.decision) - ORDER.indexOf(y.decision) || y.fit - x.fit,
  columns: ['decision', 'company', 'web', 'fit', 'b2b', 'agency'],
};
const ORDER = ['ENRICH', 'REVIEW', 'DISCARD'];
