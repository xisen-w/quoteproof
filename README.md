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

Parsing is heuristic and does not replace a salesperson's review. Negative or fractional sheet quantities and explicit mixed or unsupported units are blocked from pricing; clarification must supply supported values. The app does not contact buyers or suppliers, validate live inventory, certify materials, or connect to Nicrronninoo or Block Convey. Those integrations are unavailable in this prototype; a real integration requires authorized API documentation, credentials, and agreed data mappings. Exports remain drafts and include source evidence, unresolved issues, and synthetic-data labeling where applicable. CSV cells are escaped against spreadsheet formula interpretation.
