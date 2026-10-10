# QuoteProof

QuoteProof turns pasted or uploaded RFQ text into a traceable **quote draft**. It shows extracted line items beside the source text, matches them against a catalog, surfaces unsupported details, and exports a draft for a person to review.

## Run

Requires Node.js 18 or newer. No install or external model key is needed.

```sh
node server.mjs
# open http://localhost:3000
```

Set `PORT` to use another port. `npm start` is also available. `npm test` runs the project's HTTP tests.

## Workflow and data

The core parser is deterministic and rule based. It preserves source text and requires enough information to support a catalog match: grade, sheet quantity, thickness, width, length, and dimension units. The default catalog is a clearly labeled synthetic demonstration row: 304 stainless, 0.060 × 48 × 96 in, $100 per sheet. It is illustrative only and is not market data. Passing a nonempty `catalog` to the API replaces the default catalog completely. A missing catalog price or certificate is never filled in by the app. Unresolved lines are excluded from the total; a `ready_for_review` response is still a draft requiring human review.

## HTTP API

- `GET /api/health` returns service health and the deterministic processing mode.
- `POST /api/quote` accepts JSON: `{ "rfq": "...", "catalog": [], "answers": {} }`. `catalog` and `answers` are optional. Clarification answers can be indexed by line (`{ "0": { "width_in": 48, "length_in": 96 } }`); the original `source_text` remains verbatim and resolved fields are human-provided. Responses include `status`, `lines`, `total_usd`, `issues`, and explicit unavailable integration states for Nicrronninoo and Block Convey.
- `GET /` serves the static interface from `public/`.

RFQ request bodies are limited to 1 MB and RFQ text to 50,000 characters. Invalid JSON, empty RFQs, and malformed optional fields receive 4xx responses.

## Limitations

Parsing is heuristic and does not replace a salesperson's review. Negative or fractional sheet quantities and explicit mixed or unsupported units are blocked from pricing; clarification must supply supported values. The app does not contact buyers or suppliers, validate live inventory, certify materials, or use sponsor models to set quote prices. Optional Nicrron advice and Block Convey PRISM tracing are separate from the deterministic quote engine, as described below. Exports remain drafts and include source evidence, unresolved issues, and synthetic-data labeling where applicable. CSV cells are escaped against spreadsheet formula interpretation.

### Optional sponsor assistance (not required to quote)

The **Explain with Nicrron** button explicitly sends the RFQ and deterministic
review to Nicrron's OpenAI-compatible endpoint using `nicrron/auto`. Its plain-text
advice is separate from quote calculations and exports. The system prompt forbids
inventing specifications, prices, or certificates; all advice still needs human
review. Configure only server-side environment variables:

- `NICRRON_API_KEY`
- `PRISMTRACE_API_KEY`
- `PRISMTRACE_PROJECT_ID`

After a successful model response, configured PRISM tracing records the actual
messages, output, returned model, and measured latency. The UI distinguishes a
recorded trace, unconfirmed response, unavailable configuration, and delivery
failure. No keys are served to the browser. Missing keys leave normal quoting
working and show assistance as unavailable. Network responses and input sizes
are bounded; redirects are rejected. Assistance has a process-local limit of 20
attempts/hour and one concurrent request; this is a prototype limit, not durable
account-level billing control. Restarting or scaling resets/multiplies it.

The model timeout is 15 seconds; trace timeout is 5 seconds. Requesting AI advice
may transmit RFQ data to both configured providers. Do not use confidential RFQs
without appropriate provider arrangements. The app does not auto-transmit on
paste, analyze, or export.

Implementation references: [Nicrron quickstart](https://nicrron.ai/docs/quickstart),
[PRISM documentation](https://blockconvey.com/docs).

**Validation status (2026-10-10):** adapter tests use controlled provider responses.
The deployed preview also passed a real Nicrron request and PRISM trace ingestion;
PRISM setup-doctor returned HTTP 200, `live_connected: true`, and
`blocked_step: null`. A real mobile browser verified that requesting advice
records a trace without changing the quote. This HTTP trace path is after-call
observation, not a blocking guardrail. Sponsor guardrail/evaluator/knowledge-base requirements remain
unfulfilled/unverified. This addition must not be presented as complete hackathon
sponsor compliance. Existing deterministic draft integration fields describe the
quote engine, not whether optional advice was requested.
