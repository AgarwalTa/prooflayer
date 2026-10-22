# ProofLayer Local

**A privacy-first, browser-based prototype for checking AI-generated claims against source evidence.**

ProofLayer Local helps reviewers compare a generated answer with the source text it is meant to rely on. It creates a claim-by-claim ledger with a closest source passage and one of four heuristic outcomes: Supported, Contradicted, Insufficient evidence, or Needs review.

> **Prototype limitation:** the current engine uses simple text-overlap, number, and negation heuristics. It is not a language model, fact-checking authority, or proof that a claim is true. Always inspect source passages yourself.

## Run it

No build tools, package manager, API key, account, or backend are needed.

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. Paste source material and generated claims, or choose **Load example**.
4. Select **Run evidence check**.
5. Inspect the evidence ledger and optionally export JSON or CSV.

## Privacy by design

- The project is a static HTML/CSS/JavaScript app with no server endpoint.
- Analysis runs in the current browser page.
- The app does not intentionally transmit pasted text, create an account, or save text to browser storage.
- There are no external runtime libraries, analytics, fonts, or AI API calls.
- The user can explicitly export a results file to their own device.

When hosted (for example, with GitHub Pages), the browser still requests the site's static files from the hosting provider. The privacy promise is that the app code does not send the text you paste to a service. Verify network behavior in browser developer tools before using sensitive material.

## Current behavior

- Paste source text and AI-generated claims.
- Use one claim per line for the clearest results.
- Match each claim to a source sentence or line.
- Surface a conservative heuristic result and closest evidence passage.
- Export findings as JSON or CSV.
- Keep the workflow local and dependency-free.

## Roadmap

- Improve claim segmentation and make the rule engine easier to test.
- Add a transparent, labelled evaluation set with expected outcomes.
- Expand tests for amounts, dates, negation, paraphrases, ambiguity, and irrelevant evidence.
- Add a reproducible test harness and document known failure modes.
- Improve accessibility and usability after manual browser testing.

## Development notes

The current matching algorithm is intentionally small and explainable. Similarity scores shown in the interface are *text-overlap heuristics*, not calibrated confidence probabilities. Numeric and polarity rules can misinterpret context. The tool should prefer “Needs review” or “Insufficient evidence” rather than claim it has proved a fact.

## License

MIT. See [LICENSE](LICENSE).
