# Contributing

Thanks for helping people learn SQL! Bengali wording fixes, new missions, bug reports and tests are all welcome. Issues and pull requests may be written in Bengali or English. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest
npm run lint
npx tsc --noEmit
npm run build      # must pass before a PR
npm run test:e2e   # Playwright against the build (desktop + phone)
```

## Code style

- TypeScript strict mode, 2 spaces, double quotes, trailing commas.
- `src/lib` stays free of React. Logic talks to SQLite only through the `Engine` interface (`src/lib/db/types.ts`), so it can be tested in Node with real sql.js (`tests/engine.ts`).
- The visualizer never evaluates SQL itself. It builds smaller SELECT queries from the user's clauses and runs them in SQLite.
- Interface text lives in `src/lib/ui-text.ts`. Explanations, error translations and stage notes live in `explain.ts`, `errors.ts` and `stages.ts`. Write numbers with Bengali digits (`bn()`).
- Bengali text should be short, friendly and plain. Keep SQL keywords and identifiers in English.

## Adding a mission task

1. Add the task at the **end** of a mission or as a new mission at the end of `MISSIONS` in `src/lib/missions.ts` (saved progress is a plain counter).
2. Give it a `label`, a `hint`, a `solution` and a `check`: `rows` (order ignored), `ordered`, or `state` with a `verify` query that returns 1 when done.
3. Run `npm test`. `tests/missions.test.ts` runs every solution and checks that it passes, and that `state` tasks are not already done before their solution runs.

## Changing the sample data

Edit `scripts/gen-datasets.mjs` and run `node scripts/gen-datasets.mjs`. Do not edit `src/lib/db/datasets/*.ts` by hand. Run `npm test` afterwards; some tests and missions depend on the data.
