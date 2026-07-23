# CareFlow QA tests

The QA harness has two layers:

- `npm test` runs dependency-free static integrity checks with Node: JavaScript syntax, duplicate HTML IDs, local label/ARIA ID references, accessible ownership, exact `public/` ↔ `docs/` parity, QA source gating, and defensive clinical catalog checks.
- `npm run test:e2e` runs the keyboard interaction suite in Chromium, Firefox, and WebKit against the built-in static server.

## Setup and commands

Node 20 or newer is recommended.

```sh
npm install
npx playwright install chromium firefox webkit
npm test
npm run test:e2e
```

To run everything after the three Playwright browsers are present:

```sh
npm run test:all
```

The browser suite starts `tests/static-server.mjs` automatically on `127.0.0.1:4173`. Set `PORT` to use another port. `STATIC_ROOT` can point the test server at another local deploy tree for controlled baseline comparisons. You can also start it manually with `npm run serve:test`.

The end-to-end tests authenticate using the existing demo `sessionStorage` contract and visit `/entrega.html?qa=1` only when a scenario injector is needed. They cover the default Standard navigation, the optional Agile two-level Tab and Shift+arrow model, persisted mode selection, assessment-scale bounds/decimal steps, directional modal actions, smart stage entry, in-field arrows, directional PAE restoration, global direct writing, the representative desktop/zoom viewport matrix, focus, transactions, undo, optional-date validity, clipboard fallbacks, cumulative unlock, dynamic-component lifecycle, and frozen HTML/plain-text fingerprints for the four clinical QA notes. A full Agile minimum note also runs through the real UI with keyboard only. They do not modify or persist clinical content. The only permitted `localStorage` entry is the non-clinical device preference `cf_keyboard_navigation_mode`.

The measured legacy/refined navigation baseline is stored in `tests/fixtures/keyboard-expert-baseline.json`; it contains interaction counts only, never clinical values. Set `PRINT_EXPERT_METRICS=1` when running the expert test to print the current in-memory measurement.

Headless WebKit cannot emulate the macOS “Full Keyboard Access” preference. Its continuous-page smoke therefore covers the clinical control block; the modal focus cycle is fully automated, and Safari keyboard traversal remains part of the manual matrix with Full Keyboard Access enabled.

For synthetic usability sessions, `window.CareFlowMetrics.snapshot()` returns an in-memory event summary and `window.CareFlowMetrics.reset()` starts a new measurement. The collector accepts only control/stage IDs, modality, action, outcome, transitions, and counts. It never records field values and never writes to browser storage.
