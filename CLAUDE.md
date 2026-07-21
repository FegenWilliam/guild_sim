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

The render entry points:
- `render()` (`ui/adventurers.js`) — the Adventurers view (topbar, roster,
  statsheet). Call this after any change to gold/day/roster/HP/XP/inventory.
- `renderDungeons()` (`ui/dungeons.js`) — the Dungeons view; dispatches to the
  list / detail / enemy / battle sub-screens based on `state.dungeonScreen`.
- `renderTown()` (`ui/town.js`) — the Town view; dispatches to a service based
  on `state.townService` (the Equipment Shop and the Enchanter).
- `renderBattle()` (`ui/battle.js`) — the active battle, driven by the `battle`
  global (not `state`).

Top-level view switching is `showView(view)` in `ui/dungeons.js`, toggling the
Adventurers / Dungeons / Town sections on `state.view`.

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
- `src/data/items.js` — equipment slots, inventory helpers, the two item kinds
  (Loot / Equipment), and the shop catalog. See "Item system" below.
- `src/data/enemies.js` — `ENEMIES` bestiary, `enemyXP` (XP derived from
  statline), `rollSpawnCount` (hidden `spawn` chances → 1–5 per pack), and
  `rollLoot(table)` (per-kill drop rolls). Each enemy can carry a `loot` table,
  a `skills` list, and a `mods` list.
- `src/data/dungeons.js` — `DUNGEONS`. A dungeon lists enemy ids and an optional
  `maxWaves` cap. Currently just The High Tower (goblins, 100-wave cap).
- `src/data/skills.js` — `SKILLS` catalog + pure helpers. Per-class skills, a
  `{ skillId: level }` learning model, per-level scaling (`effectiveSkill`), MP
  cost, target count, repeat, and effect flags. See "Skill system" below.
- `src/data/effects.js` — the shared combat-effects pool. One vocabulary of
  `kind`-tagged effect descriptors (`damageTakenMult`, `damageDealtMult`,
  `extraActions`, `ignoreDef`, `dot`, `lifesteal`, `maxHpMult`, `lastStand`)
  that enemy mods/skills (and, in time, enchantments) reference. `resolveEffects`
  collapses a list into one bundle combat reads. See "Effects pool" below.
- `src/data/enemySkills.js` — `ENEMY_SKILLS` catalog + helpers. Enemy-side skills
  (MP cost, cooldown, `power` stat weights, target count / `allTargets`), aimed
  at the party. See "Enemy skills & mods" below.
- `src/data/enemyMods.js` — `ENEMY_MODS` catalog + helpers. Named bundles of
  effects (from the pool) that make an enemy harder. `gatherModEffects` resolves
  an enemy's mods into one bundle. See "Enemy skills & mods" below.
- `src/data/enchantments.js` — the enchant-stone economy: `ENCHANT_STAT_MAX`,
  the five `ENCHANT_TIERS` (drop odds + roll bands), `UNIQUE_ENCHANTS`, and the
  pure roll helpers (`rollEnchantDrops`, `rollEnchantment`, `formatModifier`).
  See "Enchantment system" below.

**State + systems** (mutate `state`, no DOM except where noted):
- `src/state.js` — the `state` object. Gameplay fields (`gold`, `day`,
  `adventurers`, the guild-wide `enchantStones` wallet) + transient UI fields
  (`view`, `dungeonScreen`, `townService`, selections).
- `src/systems/adventurer.js` — the adventurer model. `createAdventurer`,
  `effectiveStats` (the full derived statline from class+level+gear),
  `gainXP`/leveling (each level grants a skill point), and the HP/MP helpers
  `maxHp`/`currentHp`/`maxMp`/`currentMp`. An adventurer also carries a `skills`
  (`{ id: level }`) map, `skillPoints`, and a targeting `strategy`.
- `src/systems/save.js` — localStorage persistence + file export/import.
  `SAVED_FIELDS` lists what's persisted (`gold`, `day`, `maxAdventurers`,
  `adventurers`, `enchantStones`, `selectedId`, `nextId`); `applySave` normalizes
  older saves (defaults missing HP/MP, migrates the old skills array →
  `{ id: level }` map, backfills `skillPoints`/`strategy`/inventory `locked`,
  seeds a zeroed enchant-stone wallet, and backfills equipment modifier slots).
  `saveGame`/`loadGame`/`scheduleSave` (debounced), `exportSave` (downloads
  JSON), `importSaveFile`. Equipment worn and enchant modifiers ride along inside
  `adventurers`, so they persist without their own `SAVED_FIELDS` entry.
- `src/systems/day.js` — the day counter. `passDay()` heals the whole party to
  full and advances `state.day`. Player-driven via the Pass Day button.
- `src/systems/dot.js` — the standalone damage-over-time system (burn/poison/
  bleed). Owns applying, ticking, and expiring DOTs; the things that *cause* DOT
  (an innate weapon, the Blazing enchantment, a `dot` effect) hand it a source.
  See "DOT system" below.
- `src/systems/battle.js` — the autobattler. Owns the `battle` global (the
  active run) and the playback timer. See "Battle model" below. Also contains
  `startBattle` and `leaveBattle` even though they're a bit UI-adjacent.

**UI** (read state, write DOM):
- `src/ui/dom.js` — every `getElementById` resolved once into a `const`. Add new
  elements' refs here.
- `src/ui/adventurers.js` — roster, statsheet, class-picker modal, the generic
  confirm modal (`openConfirm`/`acceptConfirm`/`closeConfirm`), the inventory
  (loot/equipment cells, lock, `sellAllLoot`), and the top-level `render()`.
- `src/ui/skills.js` — the Skills tab: skill-point balance, the Lowest/Highest
  targeting toggle, and skill cards (unlock / level up). `renderSkills()`.
- `src/ui/dungeons.js` — view switching (`showView`), dungeon navigation, the
  copy-enemy helper, `renderDungeons()`.
- `src/ui/town.js` — the Town view: service switcher between the Equipment Shop
  and the Enchanter. `renderTown()` dispatches on `state.townService`;
  `renderShop()` draws the shop (grid → item detail, Buy).
- `src/ui/enchant.js` — the Enchanter service: the stone wallet, the selected
  adventurer's enchantable gear grid, and an item's six modifier slots with a
  roll button per stone tier. `renderEnchant()`.
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
- Party combatants carry their learned skills and an MP pool; each turn
  `chooseSkill` picks an affordable, appropriate skill (else a basic attack) and
  `resolveSkill` pays its MP and fires it, aimed by the adventurer's `strategy`.
  Skill math lives in `data/skills.js`; see "Skill system".
- Enemies now fight back with skills and mods too. An enemy carries its own MP
  pool and skills (`data/enemySkills.js`): each turn it uses the first skill
  that's both affordable and off cooldown (else a basic attack), aimed at the
  party. Its `mods` (`data/enemyMods.js`) resolve through the shared effects pool
  (`gatherModEffects`) into a bundle the combatant carries — see "Effects pool"
  and "Enemy skills & mods".
- On hit, DOT sources apply through `systems/dot.js` and `lifesteal` heals the
  attacker; `tickDot` runs at the start of a combatant's turn. A defeated enemy
  rolls its `loot` (`awardLoot`; see "Item system") and its enchant stones
  (`awardEnchantStones`; see "Enchantment system"), whether it dies to an attack
  or to a DOT tick.
- **Persistent HP/MP**: current HP and MP live on the adventurer (`a.hp`/`a.mp`)
  and survive between runs; both only refill on Pass Day. Entering starts the
  party at `currentHp`/`currentMp`, not full. This is the deliberate brake on
  grinding dungeons.

## Stat system

Primaries (STR/DEX/INT) drive everything. A class grants a fixed amount of each
primary per level; every derived stat (HP, ATK, DEF, CRIT, …) is computed from
the primaries in `effectiveStats`. Gear primaries fold in *before* derived stats
are computed (so +STR cascades into HP/ATK/…); gear bonuses to derived stats
stack flat on top afterward. Gear can now actually be worn — `equipItem` /
`unequipItem` (`data/items.js`) move a piece between the bag and its slot (a
displaced piece returns to the bag), and `equipmentBonuses` folds equipped gear
(both its `bonuses` and its rolled enchant `modifiers`) into the statline.

## Skill system

Each adventurer owns skills as a `{ skillId: level }` map (`data/skills.js`). A
class opens with its starter skill at Lv 1; leveling earns +1 skill point per
character level (`gainXP`), spent to unlock a new skill or raise a learned one to
`SKILL_LEVEL_CAP`. An unlock can gate on a prerequisite skill (and level).

`data/skills.js` is pure data + pure helpers — the one place scaling lives.
`effectiveSkill(skill, level)` collapses a skill's base params plus its
`levelUps` steps into concrete damage / cost / targets / repeat; `skillDamage`,
`skillCost`, `skillMaxTargets`, `skillRepeat` read it. Damage is a weighted stat
sum (`power`, e.g. `{ INT: 2, MATK: 1 }`), and `effects` is an open list of flags
that change resolution — only `"ignoreDef"` is wired into combat so far. The
file header documents the full skill shape; adding a skill = one `SKILLS` entry.

The mutation (learn / level up) lives in `ui/skills.js`; using a skill in a fight
lives in `systems/battle.js` (`chooseSkill` → `resolveSkill`). A party member's
`strategy` ("lowest" | "highest" enemy HP) aims both basic attacks and skills.

## Item system

Two item kinds fill inventory slots, both tagged by `type` (see `data/items.js`):

- **Loot** — `{ type: "loot", name, price, locked }`. What enemies drop; its
  only use is being sold. An enemy carries a `loot` drop table (array of
  `{ name, chance, price }`); `rollLoot` rolls each entry independently per kill.
  On a kill, `systems/battle.js` (`awardLoot`) stashes each drop in the first
  party member with a free bag slot — a full bag logs the loss.
- **Equipment** — `{ type: "equipment", equipId, name, slot, bonuses,
  modifiers, locked }`, plus an optional innate `dot`. Bought in the shop.
  `bonuses` is a list of descriptors, each flat (`{ stat, value }`) or scaled
  (`{ stat, perStat, mult }`, e.g. the Crossbow's +2× DEX). Only flat bonuses
  fold into a statline today; scaled ones await equip-time math. `modifiers` is
  six slots (`EQUIPMENT_MODIFIER_SLOTS`) filled by the Enchanter — each a flat
  `{ stat, value, tier }` or a `{ unique, value, tier }`; see "Enchantment
  system". An innate `dot` makes the weapon apply damage-over-time on hit (see
  "DOT system").

Inventory (per-adventurer, a dense array; `addToInventory`/`inventoryHasSpace`)
lives on the statsheet's Inventory tab. **Sell All Loot** (`sellAllLoot`) sells
every *unlocked* loot item across the whole guild; **double-clicking a slot**
toggles that item's `locked` flag, protecting it from the sale. Inventory rides
along in `adventurers`, so it's already persisted — no `SAVED_FIELDS` change.

The **Equipment Shop** (Town view) sells from `SHOP_EQUIPMENT`; buying mints a
fresh instance (`createEquipmentItem`) into the *selected* adventurer's bag and
spends `state.gold`. To add stock, append to `SHOP_EQUIPMENT`; to add a droppable
item, add a `loot` entry on an enemy. Both are pure data.

## Effects pool (data/effects.js)

The single vocabulary of reusable combat effects. Anything that wants to change
how a fight resolves — an enemy mod, an enemy skill, a future enchantment —
describes itself by picking one or more `kind`-tagged effect descriptors from
here and giving each a magnitude. `resolveEffects(list)` collapses a list into
one bundle (`{ damageTakenMult, damageDealtMult, extraActions, ignoreDef, dots,
lifesteal, maxHpMult, lastStand }`) that combat reads cheaply each hit/turn;
`NO_EFFECTS` is the identity bundle for a combatant with none. Unknown kinds are
silently skipped, so half-written data never throws mid-fight.

The point is that a new mod or skill is **pure data** as long as it reuses an
existing kind — no battle code. Adding a *new kind* means a case in
`resolveEffects` plus the matching hook in `systems/battle.js`. The `dot` kind
routes into `systems/dot.js`; `lifesteal`/`maxHpMult`/`lastStand` re-express
unique-enchantment mechanics (`data/enchantments.js`) so mods can reuse them
without touching the enchantment code — the older enchantment "uniques" remain a
parallel set of bespoke hooks that can migrate onto this pool over time.

## Enemy skills & mods (data/enemySkills.js, data/enemyMods.js)

Enemies fight back. Both are pure-data catalogs assigned to an enemy by listing
ids on its definition (`skills: [...]`, `mods: [...]` in `data/enemies.js`).

- **Enemy skills** (`ENEMY_SKILLS`) are simpler than player skills — no levels,
  no unlock economy — and aim at the *party*. Each has an MP `cost`, a
  `cooldown` (counted in the enemy's own turns), a `power` stat-weight map
  (`enemySkillDamage`), and a target count (`maxTargets`, or `allTargets` for the
  whole party). Combat uses the first skill that's both affordable and off
  cooldown, else a basic attack. `effects: ["ignoreDef"]` is the one flag the
  skill path reads today.
- **Enemy mods** (`ENEMY_MODS`) are named bundles of effects from the pool — the
  enemy-side analogue of an enchantment. `gatherModEffects(enemy)` resolves all
  of an enemy's mods into one bundle the combatant carries into the fight,
  mirroring how a party member carries its gathered uniques. Because mods lean on
  the shared pool, adding one is pure data as long as its effect kinds exist.

## Enchantment system (data/enchantments.js, ui/enchant.js)

Enchantment stones are a **guild-wide counted resource** (`state.enchantStones`,
keyed by tier id), *not* inventory items — no cap, so a full bag never blocks a
drop. A defeated enemy rolls each of the five tiers independently
(`rollEnchantDrops`, driven by `awardEnchantStones` in battle); rarer tiers only
become likely against higher-XP enemies (`enchantDropChance`).

`data/enchantments.js` is pure data + pure helpers — the single place the tuning
lives. `ENCHANT_STAT_MAX` is the "100%" of every enchantable stat; `ENCHANT_TIERS`
carries each rarity's drop odds *and* its roll band (the % of the stat max it
rolls into — Common in the bottom fifth, Legendary in the top). `rollEnchantment
(tierId, existing)` produces one modifier for a slot: it first checks each
eligible `UNIQUE_ENCHANTS` entry on its own flat chance, else rolls a plain stat
inside the tier's band. **Enchantments are exclusive** — no stat or unique
repeats on the same piece, so anything already on the item is excluded.

The **Enchanter** (Town view, `ui/enchant.js`) spends a stone to roll a modifier
into one of an equipment's six `modifiers` slots, working on the adventurer
selected in the Adventurers menu (like the shop). Flat stat modifiers fold into
the statline through `equipmentBonuses`; uniques are gathered separately by
`gatherUniques` for combat to read. `formatModifier` / `formatModifierShort`
render a rolled slot.

## DOT system (systems/dot.js)

A standalone damage-over-time mechanic (burn/poison/bleed), independent of any
one source. A combatant carries `dots` (active DOTs, keyed by type so a poison
and a burn tick side by side) and `dotSources` (the DOTs it *inflicts* on hit).
The things that *cause* DOT — an innate weapon `dot`, the Blazing enchantment, a
`dot` effect from a mod — just describe a source and hand it here
(`dotSourceFrom`, `gatherDotSources`). Within a type, **strongest wins**: a
bigger per-turn tick replaces and refreshes a weaker one (`applyDot`).

`applyHitDots` lays an attacker's sources on a target it hit (each tick a percent
of that hit); `tickDot` runs at the start of a combatant's turn, skips DEF and
evasion, and expires finished DOTs. A DOT can down a combatant — for an enemy
that resolves exactly like a normal kill, awarding loot and enchant stones.

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
