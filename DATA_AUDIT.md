# EdgeBall Data Audit — Codebase ↔ Supabase PYTH

**Date:** 2026-10-05  
**Project:** EdgeBall PYTH (`ijladlqcdmvmstgovvcf`, `eu-west-2`)  
**Scope:** `src/` loaders and schema consumers vs live `public` relations  
**Constraint:** Audit only — no UI code in this pass.

---

## 0. Executive verdict

| Layer | Reality | UI impact |
|-------|---------|-----------|
| Core identity (`fixtures`, `teams`, `leagues`, `standings`) | Populated | Match boards work when loaders use `date` / `logo` |
| Prices (`prematch_odds`, Bet365 `bookmaker_id=8`) | ~2,490 rows; rich match + player markets | Match lines OK; **player props mostly name-only** |
| Season proof (`player_season_stats`) | ~28k rows | Primary honest proof today |
| Model / edge (`model_prob`, `edge_pct`) | Sparse: **16 / 2,490** Bet365 rows; **184** card values with JSON `model_prob` | Value / +Edge desks stay thin |
| Last-5 form (`fixture_player_statistics`) | **0 rows** | Hot streak / HitRateStrip / SOT overdue always empty |
| Generated types (`src/types.ts`) | Drifted (ghost cols + ghost tables; missing live tables) | Typecheck lies; some loaders 500 on wrong columns |

**Bottom line:** The product already has prices and season rates. The biggest disconnects are (1) **name→`player_id` resolution** for non-card player markets, (2) **empty FPS** used for form, (3) **missing summary tables** still queried by home/today, and (4) **stale types / ghost columns** (`kickoff_at`, `logo_url`).

---

## 1. Live population map (PYTH, 2026-10-05)

### 1.1 HAS DATA — prefer these

| Relation | Est. rows | Powers |
|----------|-----------|--------|
| `fixtures` | ~12.5k | All boards (kickoff = column `date`) |
| `prematch_odds` | 2,723 (Bet365 2,490) | Prices + sparse model/edge |
| `player_season_stats` | ~28k | Fouls/90, yellows, SOT/90, apps |
| `standings` | 798 | Form string, GF/GA, BTTS rates |
| `team_statistics` | ~1.5k | League lenses |
| `team_squads` | ~29k | Player identity on boards |
| `players` / `player_profiles` | ~39k | Names, photos |
| `predictions` / `custom_predictions` | 249 each | Fixture model bars (secondary) |
| `fixture_statistics` | **1,174** | Team match sheets + **referee yellow rates** (via `utils/stats/referees.ts`) |
| `team_match_sheet_totals` (view) | **192** | xG / corners averages (now present) |
| `top_*` leaderboards | ~800–900 | Competitions rankings |
| `bookmakers` / `bets_master` | filled | Catalog (note: not `bets`) |

### 1.2 EMPTY / NEAR-EMPTY — traps

| Relation | Rows | Callers that still assume data |
|----------|------|--------------------------------|
| `fixture_player_statistics` | **0** | `match-log.ts`, `builder/load.ts` enrich, streaks, club extras, fixture detail |
| `fixture_events` | 0 | `fixtures/[id]/load.ts` |
| `fixture_injuries` / `match_injuries` | 0 | injuries UI |
| `live_odds` | 0 | live tabs |
| `fixture_lineups` | 2 | lineup tabs |

### 1.3 MISSING RELATIONS (`to_regclass` → null)

| Expected | Referenced by | Live status |
|----------|---------------|-------------|
| `referee_summary` | `home-board.tsx`, `home-picks.ts`, `api/fixtures/upcoming` | **MISSING** (soft-fail in some paths) |
| `player_prop_summary` | `home-board.tsx`, `home-picks.ts`, `today/load.ts`, `today/matchup.ts`, upcoming API | **MISSING** |
| `player_prop_stats` | types + legacy | **MISSING** |
| `player_seasons` | ingest / types | **MISSING** (live uses `player_season_stats`) |
| `bets` | `ingest-detail.ts` health check | **MISSING** (live: `bets_master`) |

---

## 2. Schema mapping check (loaders ↔ tables)

### 2.1 Match Hub — `src/app/fixtures/[id]/hub-load.ts`

| Need | Queried | Live fit | Gap |
|------|---------|----------|-----|
| Fixture | `fixtures` (`date`, teams, venue) | ✅ | — |
| Match odds | `prematch_odds` → 1X2 / BTTS / O/U | ✅ abundant | — |
| Player prop board | `propValues()` requires **`player_id` on values** | ⚠️ only bet **102** (“Player to be booked”, 750 values) | Shots / SOT / fouls / scorers exist as **name + line** with **0 `player_id`** → accordion sections stay empty |
| Season proof | `player_season_stats` join | ✅ | — |
| Strict ref | `loadRefereeRates` → `fixtures` + `fixture_statistics` | ✅ now that sheets have 1,174 rows | Prefer this over missing `referee_summary` |
| Foul collision | `player_season_stats` team aggregates | ✅ partial | — |

**Hard gate (lines):** `hub-load.ts` `propValues` ~397–412 — skips any bet whose values lack integer `player_id`.

### 2.2 Prop Engine / Generator — `src/app/builder/load.ts`

| Path | What it does | Live fit |
|------|--------------|----------|
| `loadPlayerProps` ~250–326 | Builds SOT/shots/fouls/tackles/passes from **`player_season_stats`** hit probs; **no book odds** | Season rates ✅; prices ❌ until name-match |
| `loadCardProps` ~328+ | Cards from squads + **`PREMATCH_PLAYER_CARD_BET_IDS` only** | Cards priced ✅ when bet 102 present |
| `enrichPropAngles` ~938–966 | `loadMatchLog` → form/sotForm | Always `[]` (FPS empty) |
| Edge attach ~1012–1018 | `lookupCardEdge` only for `"To Be Carded"` | Non-card markets never get stored `model_prob`/`edge_pct` |
| Match props ~142–165 | 1X2 / BTTS / O/U from `prematch_odds` | ✅ |

### 2.3 Competitions — `src/app/competitions/data.ts` (+ standings / streaks)

| Need | Table | Fit |
|------|-------|-----|
| Standings | `standings` (`all_stats`, `form`, …) | ✅ |
| Season players | `player_season_stats` | ✅ live, ❌ missing from generated `types.ts` |
| Sheet averages | `team_match_sheet_totals` | ✅ view with 192 rows (blueprint was stale) |
| Streaks / match log | `fixture_player_statistics` | ❌ empty |
| Card angles | `player-angles.ts` card-only filter | ⚠️ same card gate |

### 2.4 Home / Today / Upcoming

| File | Problem |
|------|---------|
| `home-board.tsx` ~422–468 | Queries missing `referee_summary` / `player_prop_summary` (soft-fail → empty locks) |
| `home-picks.ts` ~160–161 | Same missing summaries |
| `today/desk.tsx` ~348–352 | Selects **`kickoff_at` / `kickoff_uk` / `teams.logo_url`** — **columns do not exist on live `fixtures` / likely `teams`** |
| `today/load.ts`, `today/matchup.ts` | `player_prop_summary` missing |
| `api/fixtures/upcoming/route.ts` | `referee_summary` + `player_prop_summary` |

### 2.5 Generated types drift — `src/types.ts`

| Issue | Detail |
|-------|--------|
| Ghost columns on `fixtures` | Types list `kickoff_at`, `kickoff_uk`; **live only has `date`** |
| Ghost / wrong team logo | Types lean `logo_url`; loaders often use `logo` (live) |
| Ghost tables | `player_prop_summary`, `referee_summary`, `player_prop_stats`, `player_seasons`, `bets` |
| Missing from types | **`player_season_stats`**, **`prematch_odds`**, `team_squads`, `player_profiles`, `bets_master`, … |
| Consequence | Supabase client typings reject valid queries; invalid queries look “typed OK” |

---

## 3. Empty-data traps & fallback plan

### 3.1 `fixture_player_statistics` (0 rows) — Last-5 / Hot / SOT overdue

| File | Lines (approx) | Current behaviour | Fallback |
|------|----------------|--------------------|----------|
| `src/app/competitions/match-log.ts` | 12–24 | Returns `[]` | Keep empty; **do not invent hits** |
| `src/app/builder/load.ts` | 938–966, 1038–1039 | Always empty `form` / `sotForm` | Primary proof = season rates from `player_season_stats` (already on props); hide Hot / SOT angle pills when unavailable (already) |
| `src/app/dashboard/load.ts` | 118–139 | Hot streaks always empty | Surface **season-rate leaders** or priced card edges instead of Last-5 |
| `src/app/competitions/streaks.ts` | 41+ | Empty streaks | Derive team streaks from `fixtures` + `standings.form` or hide section |
| `src/app/competitions/club-extras.ts` | 217, 260 | Empty player logs | Use `player_season_stats` season totals |
| `src/app/fixtures/[id]/load.ts` | 570+ | Empty player sheet | Prefer season proof; team sheet from **`fixture_statistics`** (now populated) |
| `src/components/stats/HitRateStrip.tsx` | empty copy | “Last-5 not stored” | Keep; never pad false misses |

**Long-term:** backfill FPS via ingest (`workers/jobs/per-minute.ts` / fixture player stats sync). Until then, season proof is the only honest primary.

### 3.2 Missing `referee_summary` / `player_prop_summary`

| Fallback | Implementation target |
|----------|----------------------|
| Referees | Already: `utils/stats/referees.ts` + `fixture_statistics` yellows (**1,174** sheets) |
| High-foul players | Aggregate from `player_season_stats.stats_data.fouls` + `appearances` (same as builder) |
| Files to rewire | `home-board.tsx` 422–468; `home-picks.ts` 160–161; `today/load.ts` ~395; `today/matchup.ts` ~147; `api/fixtures/upcoming/route.ts` ~192–203 |

### 3.3 Ghost columns (`kickoff_at`, `logo_url`)

| File | Lines | Fix |
|------|-------|-----|
| `src/app/today/desk.tsx` | 348–352 | Select `date` as kickoff; `teams.logo` not `logo_url` |
| Any ingest still writing `kickoff_at` | `utils/api-football/ingest*.ts` | Align write/read to live `fixtures.date` **or** migrate DB to add columns |
| `src/types.ts` | fixtures / teams rows | Regenerate from live PYTH |

### 3.4 Sparse model / edge

| Metric | Value |
|--------|-------|
| Bet365 rows with column `model_prob` / `edge_pct` | **16 / 2,490** |
| Card values with JSON `model_prob` | **184** (bet 102 only) |
| Writer | `src/scripts/calc-edges.ts` — **card markets only** (`CARD_MARKETS` set ~31–35) |

Fallback UI: show price + season proof; EdgeChip only when both model + odds exist (already). Expand `calc:edges` only after player markets resolve to ids.

---

## 4. Market expansion — artificial restrictions

### 4.1 What Bet365 actually stores (player-relevant)

| Bet id | Name | Bet rows | Values w/ `player_id` | Notes |
|--------|------|----------|----------------------|-------|
| 102 | Player to be booked | 17 | **750** | Only structured player-id prop today; 184 with model |
| 92 | Anytime goal scorer | 393 | 0 | Name in `value` |
| 240/241 | Home/Away player shots | 184 | 0 | `"Name - line"` in `value` |
| 269/275 | Player SOT totals | 184/141 | 0 | Same name-line shape |
| 266 | Player fouls committed | 22 | 0 | Sparse |
| 80–83, 299… | Team / match cards | many | n/a | Match-level, not player |

Match markets (1X2, BTTS, O/U, AH, corners, exact score, …) are abundant and already partially wired.

### 4.2 Code gates that keep markets closed

| File | Lines | Restriction | How to open |
|------|-------|-------------|-------------|
| `src/utils/api-football/bet-catalogs.ts` | 71–74 | `PREMATCH_PLAYER_CARD_BET_IDS` = 102, 251 | Add catalogs for shots/SOT/fouls/scorer ids already defined in `prematchBets` |
| `src/app/builder/load.ts` | 336, 744, 780, 834, 947 | `isCardBet` / card-only odds maps | Generalize to `playerMarketOddsByPlayer` for bet ids 92, 240, 241, 266, 269, 275, … |
| `src/app/builder/load.ts` | 1012–1018 | Edge lookup only if market === `"To Be Carded"` | Attach edges for any market with stored `model_prob` |
| `src/app/fixtures/[id]/hub-load.ts` | 397–412 | Require `player_id` | **Name→id resolver** against `team_squads` / `player_profiles` for name-only values; parse `"Name - N"` lines |
| `src/app/competitions/player-angles.ts` | 111 | Card name/id filter | Same multi-market parse |
| `src/scripts/sync-odds-api-io.ts` | 208–212, 248–282 | Sync writer focuses card props into bet 102 | Persist native API-Football / odds-api markets with `player_id` when available; else keep name + resolve later |
| `src/scripts/calc-edges.ts` | 31–35, 413–430 | `CARD_MARKETS` only | After id resolution, optional Poisson/rate models for SOT/fouls |

### 4.3 Recommended expansion order

1. **Resolver util** — `value` / `label` → `player_id` using squad + profile names for fixture teams.  
2. **Hub `propValues`** — accept name-resolved rows for bets 92, 240/241, 269/275, 266.  
3. **Builder** — price-match season-built SOT/foul/shot props to book lines (same resolver).  
4. **Match-level expansion** — surface more `prematch_odds` bets on Match Hub hero (DC, team totals, corners) from existing JSON (no player id needed).  
5. **`calc:edges`** — broaden only for markets with stable rates in `player_season_stats`.

---

## 5. Actionable fix checklist

Use this as the implementation backlog. Checkboxes are work items (not done in this audit).

### P0 — Stop lying / stop 500s

- [x] **Regenerate `src/types.ts` from live PYTH**  
  - Add: `player_season_stats`, `prematch_odds`, `team_squads`, `player_profiles`, …  
  - Remove or mark absent: `referee_summary`, `player_prop_summary`, `player_prop_stats`, `player_seasons`, `bets`  
  - Align `fixtures` columns to live (`date` only — no `kickoff_at`/`kickoff_uk` unless migrated)  
  - Align `teams.logo` / `leagues.logo` vs `logo_url`

- [x] **`src/app/today/desk.tsx`** — replace `kickoff_at`/`kickoff_uk`/`logo_url` with live columns (`date`, `logo`)

- [x] **`src/utils/api-football/ingest-detail.ts` / `ingest.ts`** — fixtures use `date`; team/league upserts use `logo`

- [x] **Purge ghost summary queries** (rewired to `player_season_stats` + `loadRefereeRates`):  
  - [x] `src/app/home-board.tsx`  
  - [x] `src/app/home-picks.ts`  
  - [x] `src/app/today/load.ts`  
  - [x] `src/app/today/matchup.ts`  
  - [x] `src/app/api/fixtures/upcoming/route.ts`  

- [x] **Last-5 / streak empty fallbacks** → season averages (`HitRateStrip`, streaks, dashboard hot)

### P1 — Prefer populated tables for proof

- [ ] **`src/app/competitions/match-log.ts` ~12–24** — document empty FPS; optional season-rate substitute API (not fake Last-5)

- [ ] **`src/app/builder/load.ts` ~938–966** — keep empty form; ensure Prop Engine / Dashboard copy never implies Last-5 exists  
  - [ ] Dashboard hot section (`src/app/dashboard/load.ts` ~118–139) — fallback to season-rate or priced-card leaders

- [x] **`src/app/home-board.tsx` / `home-picks.ts`** — replace `referee_summary` with `loadRefereeRates` (`utils/stats/referees.ts`) using `fixture_statistics`

- [x] **Replace `player_prop_summary` foul leaders** with `player_season_stats` aggregation (mirror `builder/load.ts` ~272–303)

- [ ] **`src/app/fixtures/[id]/load.ts` ~570+** — treat FPS as optional; promote `fixture_statistics` (1,174 rows) for team sheets

- [ ] **`src/app/competitions/streaks.ts` ~41** — hide or derive without FPS

- [x] **Confirm `team_match_sheet_totals` usage** — soft-fail kept; also wired into Match Hub / Match Card game-script via `utils/stats/discipline.ts`

### P2 — Market expansion (reflect real `prematch_odds`) — executed as user “P1”

- [x] **New util:** name/line parser + squad resolver (shared by Hub + Builder)  
  - Parse `"Dominic Calvert-Lewin - 2"` → name + line  
  - Resolve against `team_squads` / `player_profiles` for fixture team ids  
  - File: `src/utils/odds/player-prop-value.ts`

- [x] **`src/app/fixtures/[id]/hub-load.ts`**  
  - [x] allow name-resolved props (not only `player_id`)  
  - [x] map bet ids 240/241/269/275/266/92 explicitly  
  - [x] Join season proof — keep  
  - [x] Extract per-value `model_prob` / `edge_pct` from odds JSON (row column fallback for cards only)

- [x] **`src/app/builder/load.ts`**  
  - [x] broaden beyond `PREMATCH_PLAYER_CARD_BET_IDS` via `playerMarketOddsByPlayer`  
  - [x] attach book odds to season-built SOT/foul/shot rows via resolver  
  - [x] attach `model_prob`/`edge_pct` for any market that has them

- [x] **`src/utils/api-football/bet-catalogs.ts`** — export `PREMATCH_PLAYER_PROP_BET_IDS` (shots/SOT/fouls/scorer)

- [x] **`src/app/competitions/player-angles.ts`** — `cardValue` uses shared parser + row model fallback

- [x] **Match Hub context** (`hub-view.tsx` / `hub-load.ts` / `match-hub/load.ts` / `fixtures/load.ts`)  
  - Referee cards/game from `fixture_statistics` via `loadRefereeRates`  
  - Combined Card Meter from recent team yellow sheets (`loadTeamYellowRates`)  
  - `StrictRefBadge` / `MatchupClashBadge` / `GameScriptBadge` + `CardMeter` on hub + match cards  
  - Multi-market prop grid + `PoissonVsBook` (`hub-card-board.tsx`)

- [ ] **Match Hub hero markets** — add Double Chance / team totals / corners from stored bets (no player id)

- [ ] **`src/scripts/sync-odds-api-io.ts` ~208–262** — persist non-card player markets with stable ids/names (not only booking → bet 102)

- [ ] **`src/scripts/calc-edges.ts` ~31–35, 413–430** — after expansion, document/runbook for refreshing edges; optional non-card models from `player_season_stats`

### P3 — Multi-lens standings & Angle Finder (executed) + model honesty

- [x] **`loadStandingsLenses(leagueId, season)`** — `standings` + `team_statistics` + `player_season_stats` (`data.ts` / `standings-load.ts`)
- [x] **`advanced-table.tsx`** — lens pills `[ Standard | Discipline & Cards | Attacking & Goals | Home / Away ]`, lens columns, accordion next-fixture narrative + Match Hub link
- [x] **Angle Finder presets** (`AngleFilters` + `PlayerPropsBuilder`) — Hot / Ref Card Traps / SOT Overdue / Value Edges; dead filters hidden; odds pill → Bet Slip
- [x] Treat row-level `prematch_odds.model_prob` / `edge_pct` as **best card edge** only — loaders prefer per-value JSON fields  
- [x] **`lookupCardEdge` / Hub `resolveModelEdge`** — keep “never invent edge from hit-rate”  
- [ ] Runbook: `npm run calc:edges` coverage expectation (~184 valued card outcomes today, not all fixtures)

### P4 — End-to-end polish & verification (executed)

- [x] Update `A_STAR_BLUEPRINT.md` §2: `fixture_statistics` **1,174**; `team_match_sheet_totals` **192**; model row count **16** Bet365 rows  
- [x] Regenerate `src/types.ts` from live PYTH — remove ghost `league_table_advanced` / summary tables from generated types  
- [x] Dead code: no `src/` queries to `referee_summary` / `player_prop_summary` / `league_table_advanced`; `today/referee.ts` → `loadRefereeRates`  
- [x] Bet Slip: `AddToSlipButton` wires Match Hub props (Cards/SOT/Fouls/Goals), match-line pills, Prop Engine, Dashboard  
- [x] Empty states: Hub / Prop Engine / Standings degrade to muted `No Book Odds` / season-proof copy (section-level `EmptyReason`; loaders may name sources)  
- [x] TypeScript pass against regenerated schema (FPS `statistics` jsonb; `league_seasons.year` / `current`)

---

## 6. Page → truth matrix (quick ref)

| Surface | Loader | Works today | Broken / thin |
|---------|--------|-------------|----------------|
| `/fixtures/[id]` Match Hub | `hub-load.ts` | Hero match odds; card props + season proof | SOT/Fouls/Goals accordions empty (no `player_id`) |
| `/props` Prop Engine | `builder/load.ts` | Season-rate rows; card prices + sparse edges | Form empty; non-card odds mostly “No Book Odds” |
| `/generator` | same board | Match lines + card/season props | Same pricing gaps |
| `/` Dashboard | `dashboard/load.ts` ← builder | Thin value list when edges exist | Hot streaks always empty |
| `/competitions/*` | `data.ts` + extras | Standings, season stats, sheets | Streaks/FPS empties; types drift |
| `/today` | `desk.tsx` / `load.ts` | — | Ghost columns + missing summaries |
| Home locks | `home-board.tsx` | Soft-empty | Missing summary tables |

---

## 7. Suggested implementation sequence

1. Regenerate types + fix `today/desk.tsx` column bugs (P0).  
2. Rewire home/today off missing summaries → `player_season_stats` + `loadRefereeRates` (P1).  
3. Ship name→id resolver + open Hub/Builder to shots/SOT/fouls/scorers already in `prematch_odds` (P2).  
4. Expand sync + `calc:edges` once ids are stable (P2/P3).  
5. FPS backfill only after UI no longer depends on it for primary proof (optional stretch).

---

*Generated from live SQL against EdgeBall PYTH and a full `src/` loader scan. No UI code was changed in this audit.*
