<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Verification

- Typecheck: `npx tsc --noEmit --skipLibCheck`
- Tests: `npm test` (node:test via tsx, files `src/**/*.test.ts`; no extra deps)
- Lint: `npm run lint` (native flat config from `eslint-config-next`; must exit with 0 errors — warnings are tolerated).
- React 19: never name a component prop `ref` unless it is a real ref (the compiler treats it as one).

## Data notes

- Live `fixtures` columns: `date`, `home_goals`, `away_goals`, `score` (jsonb with `fulltime` = 90-min score, `halftime`, `extratime`). Migrations are stale; trust `src/types.ts`.
- Live `fixture_statistics` column is `statistics` (flat object: "Corner Kicks", "Yellow Cards", "Red Cards", "Total Shots", "Shots on Goal", "Fouls", "expected_goals"); `null` means 0 on a real sheet.
- Team percentages (BTTS, O/U, CS, FTS, corners, cards, PPG, streaks): `src/lib/stats/team-engine.ts` (pure) + `team-engine-load.ts` (server loader).
