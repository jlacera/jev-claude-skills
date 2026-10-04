# Jev — setup, API and errors

Sources: brochbuilds.com/jev (tested 18 Sept 2026), docs.typesafe.ai/api, docs.typesafe.ai/models,
vercel.com/docs/ai-gateway/modalities/evaluation, vercel.com/kb/guide/typesafe-jev-and-ai-sdk.

## 1. First call in 5 minutes (AI SDK, the route Ben Broch tested)

1. https://vercel.com/ai-gateway/models/jev → **Get API key** → create an AI Gateway key with a small budget and an
   expiry ($1 / 7 days). No separate TypeSafe key is needed for this route.
2. Node.js ≥ 22.18 (the guide's recommendation; `--env-file` exists since Node 20.6). `experimental_evaluate` needs
   `ai` ≥ 7.0.105.

```bash
mkdir jev-demo && cd jev-demo && npm init -y && npm install ai
printf '\n.env\nnode_modules/\n' >> .gitignore
echo "AI_GATEWAY_API_KEY=your_key" > .env
```

```js
// index.mjs
import { experimental_evaluate as evaluate } from 'ai';
const result = await evaluate({
  model: 'typesafe-ai/jev',
  state: 'The support agent issued a full refund to the customer.',
  questions: { refunded: { type: 'boolean', instructions: 'Was a refund issued?' } },
  maxRetries: 0,
});
console.log(JSON.stringify(result.answers, null, 2));
// { "refunded": { "type": "boolean", "probability": 0.99 } }
```

`node --env-file=.env index.mjs` → the guide's real result: 0.99, 642 ms including network, $0.000011844.
Counter-test: "The customer requested a refund, but the agent hasn't processed it." A probability is not a guarantee.

**Prompt to let Claude Code / Codex set it up (original from the guide):**

```
Set up a working Jev demo on my computer using Vercel AI Gateway.
1. Read https://vercel.com/ai-gateway/models/jev and the current AI SDK docs. Use experimental_evaluate with model typesafe-ai/jev, not generateText.
2. Create a separate jev-demo folder. Check that Node.js is version 22.18 or newer, then install ai. Keep existing projects unchanged.
3. Reuse AI_GATEWAY_API_KEY if already configured. Otherwise help me create a Vercel AI Gateway key with a small spend cap and expiration. Store it in a local .env excluded from Git. Never print the key or include it in client-side code.
4. Create index.mjs with a boolean question asking whether a refund was issued. Use the state: "The support agent issued a full refund to the customer." Run it with node --env-file=.env index.mjs.
5. Print the returned probability, total elapsed time including network, and cost if the API reports it. Then test: "The customer requested a refund, but the agent has not processed it." Compare the actual results without inventing any output.
6. If access fails, explain the exact blocker. Vercel may require a credit card before requests work. Ask me to handle sign-in, verification, or billing when needed. Do not buy credits or change billing automatically.
7. Leave me a short README with the command to run it again. Keep it local; no deployment is needed.
```

## 2. Deploying on Vercel (Next.js)

`vercel link` + `vercel env pull` writes `VERCEL_OIDC_TOKEN`; passing the model as a string (`'typesafe-ai/jev'`) lets
the AI SDK authenticate on its own. Locally the token expires after 12 h (401 → `vercel env pull`). Explicit provider:
`import { gateway } from '@ai-sdk/gateway'; model: gateway.evaluationModel('typesafe-ai/jev')`.

Network-free tests: `Experimental_EvaluationMockModelV4` from `ai/test` returns the answers you give it, so you can
unit-test threshold logic. Choice/Score confidence via the AI SDK:
`result.providerMetadata?.typesafe?.confidence[questionId]` (not returned for booleans). If missing, send to review.

## 3. Plain HTTP (Python, PHP, n8n, cURL)

```bash
curl https://ai-gateway.vercel.sh/v1/evaluate \
  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"typesafe-ai/jev","state":"I was charged twice for my subscription.",
       "questions":{"refund":{"type":"boolean","instructions":"Is the customer asking for money back?"}},
       "providerOptions":{"gateway":{"zeroDataRetention":true}}}'
```

Response: `{ model, answers: { refund: { type: "boolean", probability: 0.98 } }, usage: { inputTokens, outputTokens },
providerMetadata: { gateway: { cost: "0.00001155", ... } } }`.

Gateway options: `zeroDataRetention`, `only: ["typesafe-ai"]`, and **Evaluation Fallbacks** (opt-in): rerun with
another model when a Choice/Score has low confidence or a boolean falls in an uncertain band (both stages are billed).

**Python:** `scripts/jev_client.py` (no dependencies). The official `typesafe_sdk` (Choice/Score/Noul,
`client.system_one(...)`) uses the native API and a TypeSafe key.

**n8n:** `scripts/n8n-jev-lead-triage.json`. *Header Auth* credential: Name `Authorization`, Value `Bearer <key>`.
HTTP Request POST, JSON body built with `JSON.stringify({...})`, *Retry on fail* with 3 tries. Existing community nodes:
`vibe-with-me-tools/n8n-nodes-jev` (judgment steps, unsure items go to a person) and
`khmuhtadin/n8n-nodes-jev-classification` (one branch per category + a "Needs Review" branch). Review their code and
maintenance before installing them in production.

## 4. Native TypeSafe API

`POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer $TYPESAFE_API_KEY`, `model: "jev-latest"`.
Types `noul` | `choice` | `score`. Answers: noul → `noul` (0–1); choice → `choice`, `probabilities`, `confidence`;
score → `score`, `legend`, `probabilities`, `confidence`. `GET /v1/models` lists models. Aliases `jev-latest` and
`jev-preview` (both → `jev-1.13.0` today); pin the version if you have calibrated thresholds. The Gateway also exposes
a TypeSafe-compatible API: an existing TypeSafe client only needs its base URL changed.

`instructions` and `criteria` accept objects/arrays: the question in one field and data in others, referenced with
backticks:

```json
"instructions": { "potential_duplicate": { "name": "John Smith", "location": "Oakland" },
                  "question": "Is the resume for the same person as `potential_duplicate`?" }
```

## 5. Limits and pricing (docs, Oct 2026)

| | |
|---|---|
| Price | $0.042 / M input tokens; output free |
| Context | 64k tokens per request; 32k for `state` + the longest question |
| Rate limit | ~100k tokens/s and 80 req/s (dynamic, may change without notice); higher on enterprise plans |
| Input | Text only (string, JSON, array). Images/audio → convert to text first |
| Choice / Score | 2–255 options / 2–10 levels |
| Data | No training on customer data; per-request ZDR via the Gateway; DPA at docs.typesafe.ai/legal |

## 6. Errors

| Code | Cause | Action |
|---|---|---|
| 401 / 403 | Missing or invalid key, expired OIDC token | Check `.env`; `vercel env pull` |
| 422 | Malformed request (required field, invalid question) | The body names the field |
| 429 | Rate limit | Exponential backoff, honor `retry-after`, lower concurrency |
| 529 | TypeSafe overloaded | Backoff |
| "upstream provider is currently experiencing high demand" | Call burst | Pool of 3, raise gradually |
| `InvalidResponseDataError` (AI SDK) | Incomplete distribution | Retry; report if it persists |
| `NoSuchModelError` | Wrong model ID or provider without evaluation | `typesafe-ai/jev` via the Gateway |

## 7. Testing without spending

```bash
node scripts/mock-gateway.mjs 8787 &                 # MOCK_429_EVERY=4 to exercise retries
export JEV_BASE_URL=http://localhost:8787/v1 AI_GATEWAY_API_KEY=test
node scripts/jev-batch.mjs <config.mjs> data.csv
```

The mock answers by word overlap: it validates flow, CSV, retries and rules; it does **not** calibrate anything.
