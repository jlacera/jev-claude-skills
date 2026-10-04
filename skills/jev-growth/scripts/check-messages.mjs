#!/usr/bin/env node
// check-messages.mjs — Before sending: was this message written for THIS person, and would they reply?
// Based on brochbuilds.com/prospect: the same message drops from fit 0.90 (Head of Sales) to 0.08 (backend engineer).
//
//   node --env-file=.env check-messages.mjs outreach.json [--out message-review.csv]
//   outreach.json|csv: [{ "lead": "who they are, in one sentence", "message": "what you are about to send" }, ...]
//
// Verdicts:  fit < 0.50 -> WRONG PERSON (rewrite or skip)
//            fit ok and reply < 0.50 -> WEAK MESSAGE (rewrite and score again: a fraction of a cent)
//            both clear -> SEND (by hand)
//            missing answer -> REVIEW

import * as h from '../../jev-core/scripts/jev-client.mjs';

const argv = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < argv.length; i++) argv[i].startsWith('--') ? (opt[argv[i].slice(2)] = argv[++i]) : pos.push(argv[i]);
const [file] = pos;
const OUT = opt.out ?? 'message-review.csv';
if (!file) { console.error('Usage: check-messages.mjs outreach.json [--out message-review.csv]'); process.exit(1); }

const rows = h.readTable(file);
const questions = {
  reply: { type: 'boolean', instructions: 'This person would reply to this message.' },
  fit: { type: 'boolean', instructions: "This message was written for someone in this person's role, with this person's problem." },
};

const results = await h.pool(rows, 3, async (r) => {
  const { answers } = await h.evaluate({
    state: 'LEAD: ' + r.lead + '\nMESSAGE THEY ARE ABOUT TO RECEIVE: ' + r.message,
    questions,
  });
  const fit = h.prob(answers.fit), reply = h.prob(answers.reply);
  const verdict = !Number.isFinite(fit) || !Number.isFinite(reply) ? 'REVIEW' : fit < 0.5 ? 'WRONG PERSON' : reply < 0.5 ? 'WEAK MESSAGE' : 'SEND';
  return { verdict, reply, fit, lead: r.lead, message: r.message };
});

const ok = results.filter((r) => !r.__error);
const order = { REVIEW: 0, 'WRONG PERSON': 1, 'WEAK MESSAGE': 2, SEND: 3 };
ok.sort((a, b) => order[a.verdict] - order[b.verdict] || a.fit - b.fit);
for (const r of ok) console.log(r.reply.toFixed(2), r.fit.toFixed(2), r.verdict.padEnd(13), r.lead.slice(0, 60));
h.writeCSV(OUT, ok);
h.report('check-messages');
console.error('Nothing was sent. Generic templates ("I help companies like yours grow") score low on fit for everyone: that is the point.');
