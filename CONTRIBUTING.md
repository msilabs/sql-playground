# Contributing

Thanks for helping people learn SQL! Bengali wording fixes, new lessons, new challenges, bug reports and tests are all welcome. Issues and pull requests may be written in Bengali or English. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine, every lesson box, every challenge, and browser tests in real Chrome
npm run build      # must pass before a PR
```

The site is built with [Alo](https://github.com/msilabs/alo). Read `AGENTS.md` before editing any `.alo` file.

## Code style

- Plain JavaScript, 4 spaces, no build step. `global/*.js` files are joined in name order.
- Files `01`–`15` in `global/` are the engine: no DOM, loadable in Node with `require`. DOM code lives only in `8x-`/`9x-` files.
- Logic talks to SQLite only through an engine with `load(datasetId, log)` and `run(sql, options)`. In the browser that is the worker (`80-client.js`); in tests it is real sql.js (`tests/helpers.mjs`).
- The visualizer never evaluates SQL itself. It builds smaller SELECT queries from the user's clauses and runs them in SQLite.
- Interface text lives in `global/11-text.js`. Explanations, error translations and stage notes live in `07-explain.js`, `08-errors.js` and `06-stages.js`. Write numbers with Bengali digits (`bn()`).
- Bengali text should be short, friendly and plain. Keep SQL keywords and identifiers in English.

## Adding a lesson

1. Add `data/learn/<slug>.md` with `title`, `order` and `summary` in the front matter. Renumber `order` so it runs 1, 2, 3… and update the stage ranges in `pages/learn/page.alo` if needed.
2. Use ```` ```sql ```` for runnable boxes (shop data), ```` ```sql-school ```` for the school data, and ```` ```syntax ```` for highlighted code that does not run. A box that should show an error must contain `-- ভুল হবে`.
3. Each lesson should stand on its own: someone may open it directly. Link related lessons as `/learn/<slug>/`.
4. Run `npm test`. `tests/learn.test.mjs` runs every box and checks every internal link.

## Adding a challenge

1. Add `data/challenges/NN-<slug>.json` at the **end** (older saved progress was a plain counter that maps to the first challenges).
2. Fields: `title`, `level` (`সহজ`, `মাঝারি`, `কঠিন`), `learn` (lesson slug), `task`, `hint`, `solution`, `check`: `rows` (order ignored), `ordered`, or `state` with a `verify` query that returns 1 when done. Optional `setup`: SQL statements run before the user starts.
3. Run `npm test`. `tests/challenges.test.mjs` runs every solution and checks that it passes, and that `state` challenges are not already done before their solution runs.

## Changing the sample data

Edit `scripts/gen-datasets.mjs` and run `node scripts/gen-datasets.mjs`. Do not edit `public/sql/datasets.js` by hand. Run `npm test` afterwards; lessons and challenges depend on the data.
