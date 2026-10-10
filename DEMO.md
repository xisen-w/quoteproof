# QuoteProof demo narrative

This is a short live walkthrough; no recording is included.

1. Open the local app and note the synthetic catalog banner and unavailable-provider statuses. No real market data or sponsor connection is implied.
2. Load **Clear specs**. It matches the synthetic 304, 0.060 × 48 × 96 in catalog row at $100/sheet; show the original source beside the parsed line and the quantity-scaled draft total.
3. Load **Needs clarification**. Enter each requested field, including both width and length where asked, then show the rechecked result. The original RFQ remains verbatim; the UI marks resolved specs as human clarified.
4. Try the **Conflicting grade** sample. Show that unresolved grade or certificate evidence blocks pricing while source text remains available for review. A separate optional check is `3 sheets grade 304, 0.060 x 48 x 96 in; mill test report required.`; synthetic catalog rows do not claim that certificate.
5. Export CSV or JSON and inspect its draft label, evidence and unresolved issues. It remains a draft for human approval.

A deterministic local parser powers this prototype. It is not an LLM extraction service. Prices are synthetic test values and do not represent market pricing. The browser export guards CSV cells against spreadsheet formula execution; the test covers formula-leading source text and control characters.
