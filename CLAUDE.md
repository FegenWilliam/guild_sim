# Guild Sim — project guide

An RPG management sim that runs entirely in the browser. You hire adventurers,
send them into a dungeon, and an autobattler plays out the fight.

## The one thing to know first

**This is vanilla JS with no build step, no framework, and no modules.** Every
file is a plain `<script>` loaded in `index.html`; they all share one global
scope. There is no `import`/`export`, no bundler, no `package.json` to run. You
open `index.html` in a browser and it works.

Because everything is global:
- Load order in `index.html` matters. It's dependency order:
  `config → data → state → systems → ui → main.js` (entry point, loaded last).
- A function defined in a later-loaded file can still be *called* from an
  earlier one, as long as the call happens at runtime (not at load time). E.g.
  `systems/battle.js` calls `render()` and `saveGame()`, which are defined
  later — fine, because battles only run after everything has loaded.
- Adding a new `.js` file means adding a `<script>` tag to `index.html` in the
  right spot, or nothing will load it.

## Architecture

One mutable global `state` object (`src/state.js`) is the single source of
truth. **Systems** mutate it; **UI** renders from it. Data flows one way:
act → mutate `state` → call a render function.

The three render entry points:
- `render()` (`ui/adventurers.js`) — the Adventurers view (topbar, roster,
  statsheet). Call this after any change to gold/day/roster/HP/XP.
- `renderDungeons()` (`ui/dungeons.js`) — the Dungeons view; dispatches to the
  list / detail / enemy / battle sub-screens based on `state.dungeonScreen`.
- `renderBattle()` (`ui/battle.js`) — the active battle, driven by the `battle`
  global (not `state`).

`render()` ends by calling `scheduleSave()`, so most state changes autosave for
free. The two paths that *don't* go through `render()` — renaming (skips render
to keep the caret) and battle ticks — save explicitly.

## Files

**Config / data** (pure constants + small pure helpers, no DOM):
- `src/config.js` — `HIRE_COST`, `BASE_MAX_ADVENTURERS`.
- `src/data/stats.js` — stat vocabulary, `xpToNext(level)`, `formatValue`,
  `formatXP`. XP is fractional; display helpers trim to 2 decimals.
- `src/data/classes.js` — `CLASSES` (Warrior/Ranger/Mage): per-level primary
  gains + base derived-stat overrides.
- `src/data/items.js` — equipment slots + inventory. **Scaffolding only** — no
  item system is wired up yet; everything renders as "Empty".
- `src/data/enemies.js` — `ENEMIES` bestiary, `enemyXP` (XP derived from
  statline), `rollSpawnCount` (hidden `spawn` chances → 1–5 per pack).
- `src/data/dungeons.js` — `DUNGEONS`. A dungeon lists enemy ids and an optional
  `maxWaves` cap. Currently just The High Tower (goblins, 100-wave cap).

**State + systems** (mutate `state`, no DOM except where noted):
- `src/state.js` — the `state` object. Gameplay fields + transient UI fields
  (`view`, `dungeonScreen`, selections).
- `src/systems/adventurer.js` — the adventurer model. `createAdventurer`,
  `effectiveStats` (the full derived statline from class+level+gear),
  `gainXP`/leveling, and HP helpers `maxHp` / `currentHp`.
- `src/systems/save.js` — localStorage persistence + file export/import.
  `SAVED_FIELDS` lists what's persisted; `applySave` normalizes older saves
  (e.g. defaults missing HP to full). `saveGame`/`loadGame`/`scheduleSave`
  (debounced), `exportSave` (downloads JSON), `importSaveFile`.
- `src/systems/day.js` — the day counter. `passDay()` heals the whole party to
  full and advances `state.day`. Player-driven via the Pass Day button.
- `src/systems/battle.js` — the autobattler. Owns the `battle` global (the
  active run) and the playback timer. See "Battle model" below. Also contains
  `startBattle` and `leaveBattle` even though they're a bit UI-adjacent.

**UI** (read state, write DOM):
- `src/ui/dom.js` — every `getElementById` resolved once into a `const`. Add new
  elements' refs here.
- `src/ui/adventurers.js` — roster, statsheet, class-picker modal, the generic
  confirm modal (`openConfirm`/`acceptConfirm`/`closeConfirm`), and the
  top-level `render()`.
- `src/ui/dungeons.js` — view switching (`showView`), dungeon navigation, the
  copy-enemy helper, `renderDungeons()`.
- `src/ui/battle.js` — `renderBattle()`: party/enemy cards, result banner, log.
- `src/main.js` — `init()`: `loadGame()`, wires all event listeners, first
  render. Runs immediately at load.

## Battle model (systems/battle.js)

- A **run** is a series of **waves**. Each wave is a freshly rolled enemy pack.
  Clearing a pack awards its XP and rolls the next wave; the party's HP carries
  across waves untouched (no healing mid-run).
- Combatants are plain objects, separate from adventurers. Party combatants
  carry the adventurer's `id` so HP can be synced back (`syncPartyHp`).
- Adventurers **never die**: they retreat at 1 HP (`retreatAt: 1`) and sit out
  the rest of the run. Enemies fight to 0.
- A run ends when either every adventurer has retreated (`battle.result =
  "over"`) or the dungeon's `maxWaves` cap is cleared (`"cleared"`). The banner
  in `ui/battle.js` branches on `battle.result`.
- `BATTLE_STEP_MS` (currently 90ms) paces playback. Combat math is documented in
  the file header (ATK vs DEF, MATK ignores DEF at 50%, CRIT, EVA).
- **Persistent HP**: current HP lives on the adventurer (`a.hp`) and survives
  between runs; it only refills on Pass Day. Entering starts the party at
  `currentHp`, not full. This is the deliberate brake on grinding dungeons.

## Stat system

Primaries (STR/DEX/INT) drive everything. A class grants a fixed amount of each
primary per level; every derived stat (HP, ATK, DEF, CRIT, …) is computed from
the primaries in `effectiveStats`. Gear primaries fold in *before* derived stats
are computed (so +STR cascades into HP/ATK/…); gear bonuses to derived stats
stack flat on top afterward. There's no item system yet, so gear bonuses are all
zero in practice.

## Conventions

- Match the surrounding style: heavy explanatory comments on the *why*, small
  focused functions, no classes, no `this`.
- No dependencies. Don't reach for a library or a build tool.
- New persisted field? Add it to `SAVED_FIELDS` in `save.js` and handle older
  saves lacking it in `applySave`.
- New DOM element? Add its ref to `ui/dom.js` and its markup to `index.html`.
- Keep transient UI/battle state out of the save — a reload should land on a
  clean menu with roster/gold/day intact.

## Verifying changes

There is no test runner. Verify by driving the real app in a browser. Chromium
is pre-installed; `playwright-core` drives it headless:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await (await browser.newContext()).newPage();
await page.goto('file:///home/user/guild_sim/index.html');
// click through #hire, the class modal, [data-view="dungeons"], #dungeonEnter,
// wait for #battleResult, assert on textContent, check localStorage, etc.
```

Install `playwright-core` in the scratchpad dir (not the repo) and register
`page.on('pageerror')` / console-error listeners to catch runtime breakage.
`node --check <file>` is a quick syntax gate before that.

Gotcha for tests: after leaving a battle, the Dungeons view resumes on the
*detail* screen (`state.dungeonScreen` persists), not the dungeon list — so
`.dungeon-card` won't be visible; go straight to `#dungeonEnter`.

## Git

Work happens on feature branches; commit with clear messages and push with
`git push -u origin <branch>`. Don't open a PR unless asked.
