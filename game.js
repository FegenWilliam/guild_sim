// Guild Sim — prototype
// Player manages a roster of adventurers. Each adventurer has a class (chosen
// once, at hire time, and fixed forever), a level, and XP toward the next
// level. Click an adventurer box to select them; the stat page reflects the
// selected adventurer.

const HIRE_COST = 1000;
const BASE_MAX_ADVENTURERS = 3;

// --- Stats ---------------------------------------------------------------
// Primary stats (STR / DEX / INT) are the drivers. A class grants a fixed
// amount of each primary per level (see CLASSES). Every derived stat below is
// computed from the primaries, so the whole statsheet moves when you level.
const PRIMARY_STATS = ["STR", "DEX", "INT"];

// Base derived stats — what an adventurer has with zero primaries. Each class
// starts from these defaults and overrides a few of them (see CLASSES.base).
const DEFAULT_BASE = {
  HP: 50,
  MP: 25,
  ATK: 10,
  MATK: 4,
  DEF: 5,
  CRIT: 1,         // %
  "CRIT DMG": 120, // %
  EVA: 0,          // %
};

// Display order for the statsheet: primaries first, then derived.
const DISPLAY_ORDER = [
  "STR", "DEX", "INT",
  "HP", "MP", "ATK", "MATK", "DEF", "CRIT", "CRIT DMG", "EVA",
];

// Stats shown as percentages get a trailing "%" in the stat sheet.
const PERCENT_STATS = new Set(["CRIT", "CRIT DMG", "EVA"]);

// --- Classes -------------------------------------------------------------
// A class defines two things:
//   - perLevel: a fixed allocation of primary stats gained each level. A
//     level-N adventurer has `perLevel[stat] * N` of each primary.
//   - base: overrides to DEFAULT_BASE, so each class opens with its own
//     derived statline before any primaries are applied.
const CLASS_NAMES = ["Warrior", "Ranger", "Mage"];

// Starting primaries: everyone opens with STARTING_PRIMARY in each, except
// their class's `main` stat, which starts at STARTING_MAIN.
const STARTING_PRIMARY = 2;
const STARTING_MAIN = 5;

const CLASSES = {
  Warrior: {
    main: "STR",
    perLevel: { STR: 3, INT: 1, DEX: 1 },
    base: { HP: 100, DEF: 10 },
  },
  Ranger: {
    main: "DEX",
    perLevel: { DEX: 3, INT: 1, STR: 1 },
    base: { CRIT: 3, EVA: 2 },
  },
  Mage: {
    main: "INT",
    perLevel: { INT: 3, DEX: 1, STR: 1 },
    base: { MP: 100, ATK: 4, MATK: 10 },
  },
};

// --- Equipment -----------------------------------------------------------
// Each adventurer has a set of gear slots. Nothing can be equipped yet — this
// is scaffolding: slots exist on the model and render as "Empty", ready for an
// item system to fill them in later.
//
// Active slots: helmet, chestpiece, leg armor, boots, weapon, one accessory,
// and a bag. A second accessory slot lives in the model but is `locked`, so it
// stays hidden until it's unlocked later (e.g. via a guild perk). Rendering
// skips locked slots; flipping `locked` to false is all it takes to reveal it.
//
// Item shape (no item system yet — this documents what a slot will hold):
//   Gear (everything except the bag) carries stat bonuses — one `main` stat
//   plus a list of `subs` (substats):
//     { name: "Iron Helmet", slot: "helmet",
//       main: { stat: "DEF", value: 8 },
//       subs: [ { stat: "HP", value: 20 }, { stat: "STR", value: 2 } ] }
//   A bag carries an inventory-slot bonus only, no stat bonuses:
//     { name: "Leather Pouch", slot: "bag", inventorySlots: 8 }
const EQUIPMENT_SLOTS = [
  { id: "helmet", label: "Helmet" },
  { id: "chest", label: "Chestpiece" },
  { id: "legs", label: "Leg Armor" },
  { id: "boots", label: "Boots" },
  { id: "weapon", label: "Weapon" },
  { id: "accessory1", label: "Accessory" },
  { id: "bag", label: "Bag" },
  // Future: second accessory slot, unlocked later. Hidden for now.
  { id: "accessory2", label: "Accessory", locked: true },
];

// The bag slot is special: it grants inventory space instead of stat bonuses,
// so it's excluded from stat math.
const BAG_SLOT = "bag";

// A fresh, fully-empty equipment map keyed by slot id (locked slots included,
// so the data is ready the moment a slot is unlocked).
function createEquipment() {
  const equipment = {};
  for (const slot of EQUIPMENT_SLOTS) equipment[slot.id] = null;
  return equipment;
}

// --- Inventory -----------------------------------------------------------
// Every adventurer carries a personal inventory. Without a bag they get
// BASE_INVENTORY_SLOTS; equipping a bag unlocks its `inventorySlots` bonus on
// top, up to MAX_INVENTORY_SLOTS. The inventory menu always draws the full
// MAX grid and locks the slots that aren't unlocked yet.
const BASE_INVENTORY_SLOTS = 4;
const MAX_INVENTORY_SLOTS = 40;

// How many inventory slots this adventurer currently has unlocked.
function inventorySlots(adventurer) {
  const bag = adventurer.equipment[BAG_SLOT];
  const bonus = bag ? bag.inventorySlots || 0 : 0;
  return Math.min(MAX_INVENTORY_SLOTS, BASE_INVENTORY_SLOTS + bonus);
}

// Flat stat bonuses contributed by all equipped gear (bag excluded). Sums each
// item's main stat and substats into a { stat: total } map.
function equipmentBonuses(adventurer) {
  const totals = {};
  const add = (stat, value) => {
    totals[stat] = (totals[stat] || 0) + value;
  };
  for (const slot of EQUIPMENT_SLOTS) {
    if (slot.id === BAG_SLOT) continue;
    const item = adventurer.equipment[slot.id];
    if (!item) continue;
    if (item.main) add(item.main.stat, item.main.value);
    for (const sub of item.subs || []) add(sub.stat, sub.value);
  }
  return totals;
}

// Resolved base derived stats for a class: defaults with its overrides applied.
function classBase(className) {
  return { ...DEFAULT_BASE, ...CLASSES[className].base };
}

// XP required to advance from `level` to `level + 1`.
function xpToNext(level) {
  return level * 100;
}

// --- Dungeons & enemies --------------------------------------------------
// Dungeons are the main gameplay: you send adventurers in and they run an
// autobattler — a turn-based stat check where each adventurer fights until it
// drops to 1 HP and then bows out. The battle itself isn't wired up yet; this
// is the menu scaffolding around it.
//
// A dungeon lists the enemies it contains (by id). The enemy list is the main
// info shown on a dungeon's page, so it's built to grow — add ids to `enemies`
// and matching entries to ENEMIES and they show up.

// Order enemy stats are displayed and copied in.
const ENEMY_STAT_ORDER = ["HP", "MP", "ATK", "DEF", "CRIT", "CRIT DMG", "EVA"];

const ENEMIES = {
  goblin: {
    id: "goblin",
    name: "Goblin",
    stats: {
      HP: 50,
      MP: 10,
      ATK: 10,
      DEF: 5,
      CRIT: 0,          // %
      "CRIT DMG": 110,  // %
      EVA: 0,           // %
    },
  },
};

const DUNGEONS = [
  {
    id: "high-tower",
    name: "The High Tower",
    recommendation: "Lv 1–50",
    enemies: ["goblin"],
  },
];

function getDungeon(id) {
  return DUNGEONS.find((d) => d.id === id) || null;
}

// --- Battle --------------------------------------------------------------
// The autobattler is a turn-based stat check. A round is: every adventurer
// attacks once, in roster order, then every enemy attacks once, in order.
// Rounds repeat until one side has no fighters left.
//
// Combat math:
//   - 1 ATK = 1 damage. DEF negates 0.5 damage per point (so 2 DEF cancels
//     1 ATK). Minimum damage dealt is 1 — the only way to take 0 is to evade.
//   - MATK ignores DEF entirely. A Mage's basic attack deals 50% of its MATK
//     (Mages come into their own once skills exist).
//   - CRIT% is the chance to crit; a crit multiplies damage by CRIT DMG%.
//   - EVA% is the defender's chance to dodge the hit outright (0 damage).
//
// Adventurers never die: an adventurer fights until it hits 1 HP, then it
// bows out for the rest of the battle. Enemies fight until 0 HP.
const BATTLE_STEP_MS = 650; // pacing between attacks during playback

let battle = null;      // active battle state, or null
let battleTimer = null; // interval handle for playback

function roll(percent) {
  return Math.random() * 100 < percent;
}

// Turn an adventurer into a battle combatant. Party members retreat at 1 HP.
function partyCombatant(adventurer) {
  const s = effectiveStats(adventurer);
  return {
    name: displayName(adventurer),
    side: "party",
    hp: s.HP,
    maxHp: s.HP,
    atk: s.ATK,
    matk: s.MATK,
    def: s.DEF,
    crit: s.CRIT,
    critDmg: s["CRIT DMG"],
    eva: s.EVA,
    magic: adventurer.className === "Mage",
    retreatAt: 1,
    status: "active",
  };
}

// Turn an enemy definition into a battle combatant. Enemies fight to 0 HP.
function enemyCombatant(enemy) {
  const s = enemy.stats;
  return {
    name: enemy.name,
    side: "enemy",
    hp: s.HP,
    maxHp: s.HP,
    atk: s.ATK,
    matk: s.MATK || 0,
    def: s.DEF,
    crit: s.CRIT,
    critDmg: s["CRIT DMG"],
    eva: s.EVA,
    magic: false,
    retreatAt: 0,
    status: "active",
  };
}

// Give same-named enemies distinct labels (Goblin A, Goblin B, …) so the log
// and cards stay readable when a dungeon stacks duplicates.
function disambiguate(combatants) {
  const counts = {};
  for (const c of combatants) counts[c.name] = (counts[c.name] || 0) + 1;
  const seen = {};
  for (const c of combatants) {
    if (counts[c.name] > 1) {
      seen[c.name] = (seen[c.name] || 0) + 1;
      c.name = `${c.name} ${String.fromCharCode(64 + seen[c.name])}`;
    }
  }
}

const isActive = (c) => c.status === "active";

function logLine(text, kind) {
  battle.log.push({ text, kind: kind || "" });
}

// Resolve a single attack from `attacker` against `target`, mutating the
// target's HP and status and appending to the battle log.
function resolveAttack(attacker, target) {
  if (roll(target.eva)) {
    logLine(`${target.name} evades ${attacker.name}'s attack!`, "evade");
    return;
  }

  // Mages attack with MATK (ignoring DEF) at half value; everyone else swings
  // with ATK, reduced by the target's DEF.
  let dmg = attacker.magic ? attacker.matk * 0.5 : attacker.atk;
  if (!attacker.magic) dmg -= target.def * 0.5;

  const crit = roll(attacker.crit);
  if (crit) dmg *= attacker.critDmg / 100;

  dmg = Math.max(1, Math.round(dmg));
  target.hp -= dmg;

  logLine(
    `${attacker.name} hits ${target.name} for ${dmg}${crit ? " (CRIT!)" : ""}.`,
    attacker.side === "party" ? "party" : "enemy"
  );

  if (target.hp <= target.retreatAt) {
    target.hp = target.retreatAt;
    target.status = target.side === "party" ? "out" : "down";
    logLine(
      `${target.name} ${target.side === "party" ? "retreats at 1 HP." : "is defeated!"}`,
      target.side === "party" ? "retreat" : "defeat"
    );
  }
}

function checkBattleEnd() {
  if (!battle.enemies.some(isActive)) battle.result = "victory";
  else if (!battle.party.some(isActive)) battle.result = "defeat";
}

// Advance the battle by one attack. When the round's queue empties, a fresh
// round is built from whoever is still active (party first, then enemies).
function battleStep() {
  if (!battle || battle.result) return;

  if (battle.queue.length === 0) {
    battle.round += 1;
    battle.queue = [...battle.party, ...battle.enemies].filter(isActive);
  }

  let attacker = null;
  while (battle.queue.length) {
    const next = battle.queue.shift();
    if (isActive(next)) {
      attacker = next;
      break;
    }
  }

  if (attacker) {
    const foes = attacker.side === "party" ? battle.enemies : battle.party;
    const target = foes.find(isActive);
    if (target) resolveAttack(attacker, target);
    checkBattleEnd();
  }

  renderBattle();
  if (battle.result) stopBattleTimer();
}

function startBattle() {
  const dungeon = getDungeon(state.selectedDungeonId);
  if (!dungeon) return;

  if (state.adventurers.length === 0) {
    enterNoteEl.textContent = "You have no adventurers to send in — hire one first.";
    enterNoteEl.classList.remove("hidden");
    return;
  }

  const party = state.adventurers.map(partyCombatant);
  const enemies = [];
  dungeon.enemies.forEach((id) => {
    if (ENEMIES[id]) enemies.push(enemyCombatant(ENEMIES[id]));
  });
  disambiguate(enemies);

  battle = {
    dungeonName: dungeon.name,
    party,
    enemies,
    queue: [],
    round: 0,
    log: [{ text: `You enter ${dungeon.name}.`, kind: "" }],
    result: null,
  };

  state.dungeonScreen = "battle";
  renderDungeons();

  stopBattleTimer();
  battleTimer = setInterval(battleStep, BATTLE_STEP_MS);
}

function stopBattleTimer() {
  if (battleTimer !== null) {
    clearInterval(battleTimer);
    battleTimer = null;
  }
}

function leaveBattle() {
  stopBattleTimer();
  battle = null;
  state.dungeonScreen = "detail";
  renderDungeons();
}

const state = {
  gold: 1000,
  maxAdventurers: BASE_MAX_ADVENTURERS,
  adventurers: [],
  selectedId: null,
  nextId: 1,
  activeTab: "stats", // "stats" | "equipment"
  view: "adventurers", // "adventurers" | "dungeons"
  // Which screen the dungeons view is showing:
  //   "list"   — pick a dungeon
  //   "detail" — a dungeon's page (Enter button + enemy list)
  //   "enemy"  — a single enemy's statline
  dungeonScreen: "list",
  selectedDungeonId: null,
  selectedEnemyId: null,
};

// --- Elements -------------------------------------------------------------

const goldEl = document.getElementById("gold");
const countEl = document.getElementById("count");
const maxEl = document.getElementById("max");
const rosterEl = document.getElementById("roster");
const hireBtn = document.getElementById("hire");
const statsheetEl = document.getElementById("statsheet");
const nameEl = document.getElementById("name");
const classEl = document.getElementById("class");
const levelEl = document.getElementById("level");
const xpFillEl = document.getElementById("xpFill");
const xpTextEl = document.getElementById("xpText");
const statsEl = document.getElementById("stats");
const equipmentEl = document.getElementById("equipment");
const inventoryPanelEl = document.getElementById("inventoryPanel");
const inventoryEl = document.getElementById("inventory");
const invUnlockedEl = document.getElementById("invUnlocked");
const tabButtons = document.querySelectorAll(".tab");
const emptyHintEl = document.getElementById("emptyHint");

// Maps each tab to the panel it shows.
const TAB_PANELS = {
  stats: statsEl,
  equipment: equipmentEl,
  inventory: inventoryPanelEl,
};
const classModalEl = document.getElementById("classModal");
const classChoicesEl = document.getElementById("classChoices");

// View switcher + dungeon view.
const viewNavButtons = document.querySelectorAll(".viewnav-btn");
const adventurersViewEl = document.getElementById("adventurersView");
const dungeonsViewEl = document.getElementById("dungeonsView");
const dungeonListEl = document.getElementById("dungeonList");
const dungeonDetailEl = document.getElementById("dungeonDetail");
const dungeonNameEl = document.getElementById("dungeonName");
const dungeonRecEl = document.getElementById("dungeonRec");
const dungeonBackBtn = document.getElementById("dungeonBack");
const dungeonEnterBtn = document.getElementById("dungeonEnter");
const enterNoteEl = document.getElementById("enterNote");
const enemyListEl = document.getElementById("enemyList");
const enemyDetailEl = document.getElementById("enemyDetail");
const enemyNameEl = document.getElementById("enemyName");
const enemyStatsEl = document.getElementById("enemyStats");
const enemyBackBtn = document.getElementById("enemyBack");
const enemyCopyBtn = document.getElementById("enemyCopy");
const battleScreenEl = document.getElementById("battleScreen");
const battleTitleEl = document.getElementById("battleTitle");
const battlePartyEl = document.getElementById("battleParty");
const battleEnemiesEl = document.getElementById("battleEnemies");
const battleResultEl = document.getElementById("battleResult");
const battleLogEl = document.getElementById("battleLog");
const battleBackBtn = document.getElementById("battleBack");

// --- Model ---------------------------------------------------------------

function createAdventurer(className) {
  return {
    id: state.nextId++,
    name: "Adventurer",
    className,
    level: 1,
    xp: 0,
    equipment: createEquipment(),
    inventory: [], // items indexed by slot; empty for now
  };
}

function getSelected() {
  return state.adventurers.find((a) => a.id === state.selectedId) || null;
}

// Primary stat totals: the class's starting allocation plus its per-level
// gains for every level past the first.
function primaryStats(adventurer) {
  const cls = CLASSES[adventurer.className];
  const result = {};
  for (const stat of PRIMARY_STATS) {
    const start = stat === cls.main ? STARTING_MAIN : STARTING_PRIMARY;
    result[stat] = start + (cls.perLevel[stat] || 0) * (adventurer.level - 1);
  }
  return result;
}

// Full statsheet: primaries plus every derived stat computed from them.
//
//   STR = +5 Max HP, +2 DEF, +4 ATK          | every 5: +5% CRIT DMG
//   DEX = +4 DEF, +10 Max MP, +0.05% CRIT    | every 5: +0.5% EVA
//   INT = +25 Max MP, +4 MATK, +1 ATK        | every 5: +2% Max MP (additive)
function effectiveStats(adventurer) {
  const bonuses = equipmentBonuses(adventurer);
  const b = classBase(adventurer.className);

  // Gear primary bonuses (STR/DEX/INT) fold into the primaries *before* derived
  // stats are computed, so e.g. a weapon's +2 STR raises HP/ATK/DEF/CRIT DMG
  // exactly like any other STR would.
  const base = primaryStats(adventurer);
  const p = {};
  for (const stat of PRIMARY_STATS) {
    p[stat] = base[stat] + (bonuses[stat] || 0);
  }

  let hp = b.HP + p.STR * 5;
  let mp = b.MP + p.DEX * 10 + p.INT * 25;
  const atk = b.ATK + p.STR * 4 + p.INT * 1;
  const matk = b.MATK + p.INT * 4;
  const def = b.DEF + p.STR * 2 + p.DEX * 4;
  const crit = b.CRIT + p.DEX * 0.05;
  const critDmg = b["CRIT DMG"] + Math.floor(p.STR / 5) * 5;
  const eva = b.EVA + Math.floor(p.DEX / 5) * 0.5;

  // INT grants +2% Max MP per 5 points, additive, applied to the MP pool.
  const mpPercent = Math.floor(p.INT / 5) * 2;
  mp = Math.round(mp * (1 + mpPercent / 100));

  const result = {
    STR: p.STR,
    DEX: p.DEX,
    INT: p.INT,
    HP: hp,
    MP: mp,
    ATK: atk,
    MATK: matk,
    DEF: def,
    CRIT: crit,
    "CRIT DMG": critDmg,
    EVA: eva,
  };

  // Gear bonuses to derived stats (ATK, CRIT, DEF, ...) add flat on top. The
  // primaries are already baked into `p` above, so they're skipped here — this
  // is what lets a weapon grant +2 STR and +10 ATK and have both land: the STR
  // cascades through the formulas, the ATK stacks on the result.
  for (const stat in bonuses) {
    if (PRIMARY_STATS.includes(stat)) continue;
    if (stat in result) result[stat] += bonuses[stat];
  }

  return result;
}

// Grant XP and level up as thresholds are crossed. No XP source is wired up
// yet — leveling will come later — but the mechanics are ready.
function gainXP(adventurer, amount) {
  adventurer.xp += amount;
  while (adventurer.xp >= xpToNext(adventurer.level)) {
    adventurer.xp -= xpToNext(adventurer.level);
    adventurer.level += 1;
  }
}

function hireNewbie() {
  if (state.adventurers.length >= state.maxAdventurers) return;
  if (state.gold < HIRE_COST) return;

  openClassPicker((className) => {
    state.gold -= HIRE_COST;
    const adventurer = createAdventurer(className);
    state.adventurers.push(adventurer);
    state.selectedId = adventurer.id;
    render();
  }, { cancelable: true });
}

function selectAdventurer(id) {
  state.selectedId = id;
  render();
}

function renameSelected(newName) {
  const selected = getSelected();
  if (!selected) return;
  selected.name = newName;
  // Update just the matching roster box label without a full re-render so the
  // name input keeps focus and caret position while typing.
  const box = rosterEl.querySelector(`[data-id="${selected.id}"]`);
  if (box) box.textContent = displayName(selected);
}

function displayName(adventurer) {
  return adventurer.name.trim() || "Adventurer";
}

// --- Class picker modal --------------------------------------------------

let pendingChoice = null;

function openClassPicker(onChoose, { cancelable = false } = {}) {
  pendingChoice = onChoose;
  classModalEl.classList.remove("hidden");
  classModalEl.dataset.cancelable = cancelable ? "true" : "false";
}

function closeClassPicker() {
  pendingChoice = null;
  classModalEl.classList.add("hidden");
}

function chooseClass(className) {
  const onChoose = pendingChoice;
  closeClassPicker();
  if (onChoose) onChoose(className);
}

function renderClassChoices() {
  classChoicesEl.innerHTML = "";
  CLASS_NAMES.forEach((name) => {
    const gain = CLASSES[name].perLevel;
    const focus = PRIMARY_STATS
      .map((stat) => `+${gain[stat] || 0} ${stat}`)
      .join(" / ");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "class-choice";

    const title = document.createElement("span");
    title.className = "class-choice-name";
    title.textContent = name;

    const sub = document.createElement("span");
    sub.className = "class-choice-focus";
    sub.textContent = `${focus} per level`;

    btn.append(title, sub);
    btn.addEventListener("click", () => chooseClass(name));
    classChoicesEl.appendChild(btn);
  });
}

// --- Rendering -----------------------------------------------------------

function renderRoster() {
  rosterEl.innerHTML = "";
  state.adventurers.forEach((adventurer) => {
    const box = document.createElement("button");
    box.type = "button";
    box.className = "adventurer-box";
    box.dataset.id = adventurer.id;
    box.textContent = displayName(adventurer);
    if (adventurer.id === state.selectedId) {
      box.classList.add("selected");
    }
    box.addEventListener("click", () => selectAdventurer(adventurer.id));
    rosterEl.appendChild(box);
  });
}

function formatValue(label, value) {
  if (PERCENT_STATS.has(label)) {
    // Trim to at most 2 decimals, dropping trailing zeros (e.g. 5.15, 3.5, 5).
    return `${Number(value.toFixed(2))}%`;
  }
  return value;
}

function renderStatsheet() {
  const selected = getSelected();

  if (!selected) {
    statsheetEl.classList.add("hidden");
    // With no adventurers at all, the game just shows the hire button — no
    // statsheet and no placeholder hint. The hint is only for the rare case
    // where a roster exists but nothing is selected.
    emptyHintEl.classList.toggle("hidden", state.adventurers.length === 0);
    return;
  }

  statsheetEl.classList.remove("hidden");
  emptyHintEl.classList.add("hidden");

  // Only overwrite the input when its value is stale, so an active edit isn't
  // clobbered mid-keystroke.
  if (nameEl.value !== selected.name) {
    nameEl.value = selected.name;
  }
  classEl.textContent = selected.className;
  levelEl.textContent = selected.level;

  const needed = xpToNext(selected.level);
  const pct = Math.max(0, Math.min(100, (selected.xp / needed) * 100));
  xpFillEl.style.width = `${pct}%`;
  xpTextEl.textContent = `${selected.xp} / ${needed} XP`;

  renderStats(selected);
  renderEquipment(selected);
  renderInventory(selected);
  applyTab();
}

function renderStats(selected) {
  statsEl.innerHTML = "";
  const stats = effectiveStats(selected);
  DISPLAY_ORDER.forEach((label) => {
    const row = document.createElement("div");
    row.className = "stat-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "stat-label";
    nameSpan.textContent = label;

    const valueSpan = document.createElement("span");
    valueSpan.className = "stat-value";
    valueSpan.textContent = formatValue(label, stats[label]);

    row.append(nameSpan, valueSpan);
    statsEl.appendChild(row);
  });
}

function renderEquipment(selected) {
  equipmentEl.innerHTML = "";
  EQUIPMENT_SLOTS.forEach((slot) => {
    if (slot.locked) return; // hidden until the slot is unlocked

    const item = selected.equipment[slot.id];
    const row = document.createElement("div");
    row.className = "equip-slot";
    row.classList.toggle("empty", !item);

    const nameSpan = document.createElement("span");
    nameSpan.className = "equip-label";
    nameSpan.textContent = slot.label;

    const valueSpan = document.createElement("span");
    valueSpan.className = "equip-item";
    // No item system yet, so every slot reads "Empty" for now.
    valueSpan.textContent = item ? item.name : "Empty";

    row.append(nameSpan, valueSpan);
    equipmentEl.appendChild(row);
  });
}

// Draw the full inventory grid: every slot up to MAX_INVENTORY_SLOTS, with the
// ones past the adventurer's unlocked count shown as locked.
function renderInventory(selected) {
  const unlocked = inventorySlots(selected);
  invUnlockedEl.textContent = unlocked;

  inventoryEl.innerHTML = "";
  for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
    const cell = document.createElement("div");
    cell.className = "inv-slot";

    if (i >= unlocked) {
      cell.classList.add("locked");
      cell.textContent = "🔒";
    } else {
      // No item system yet, so unlocked slots are just empty for now.
      const item = selected.inventory[i];
      cell.classList.toggle("empty", !item);
      cell.textContent = item ? item.name : "";
    }

    inventoryEl.appendChild(cell);
  }
}

// Show the panel for the active tab and highlight its button.
function applyTab() {
  for (const tab in TAB_PANELS) {
    TAB_PANELS[tab].classList.toggle("hidden", state.activeTab !== tab);
  }
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
  });
}

function setTab(tab) {
  state.activeTab = tab;
  applyTab();
}

// --- View switching ------------------------------------------------------

function showView(view) {
  state.view = view;
  adventurersViewEl.classList.toggle("hidden", view !== "adventurers");
  dungeonsViewEl.classList.toggle("hidden", view !== "dungeons");
  viewNavButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  if (view === "dungeons") renderDungeons();
}

// --- Dungeon navigation --------------------------------------------------

function openDungeon(id) {
  state.selectedDungeonId = id;
  state.dungeonScreen = "detail";
  renderDungeons();
}

function backToDungeonList() {
  state.dungeonScreen = "list";
  renderDungeons();
}

function openEnemy(id) {
  state.selectedEnemyId = id;
  state.dungeonScreen = "enemy";
  renderDungeons();
}

function backToDungeonDetail() {
  state.dungeonScreen = "detail";
  renderDungeons();
}

function enterDungeon() {
  startBattle();
}

// Build the plain-text blob copied from an enemy's page: name then one
// "STAT: value" line per stat, percentages included.
function enemyClipboardText(enemy) {
  const lines = [enemy.name];
  for (const stat of ENEMY_STAT_ORDER) {
    lines.push(`${stat}: ${formatValue(stat, enemy.stats[stat])}`);
  }
  return lines.join("\n");
}

function copyEnemy() {
  const enemy = ENEMIES[state.selectedEnemyId];
  if (!enemy) return;
  const text = enemyClipboardText(enemy);
  const done = () => {
    const original = "Copy name & stats";
    enemyCopyBtn.textContent = "Copied!";
    setTimeout(() => {
      enemyCopyBtn.textContent = original;
    }, 1200);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

// Clipboard API needs a secure context; fall back to a hidden textarea when
// it's unavailable (e.g. opened over file://).
function fallbackCopy(text, done) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
    done();
  } catch (err) {
    /* nothing else to try */
  }
  document.body.removeChild(area);
}

// --- Dungeon rendering ---------------------------------------------------

function renderDungeons() {
  const screen = state.dungeonScreen;
  dungeonListEl.classList.toggle("hidden", screen !== "list");
  dungeonDetailEl.classList.toggle("hidden", screen !== "detail");
  enemyDetailEl.classList.toggle("hidden", screen !== "enemy");
  battleScreenEl.classList.toggle("hidden", screen !== "battle");

  if (screen === "list") renderDungeonList();
  else if (screen === "detail") renderDungeonDetail();
  else if (screen === "enemy") renderEnemyDetail();
  else if (screen === "battle") renderBattle();
}

// --- Battle rendering ----------------------------------------------------

function battleUnitCard(combatant) {
  const card = document.createElement("div");
  card.className = `battle-unit ${combatant.side}`;
  if (combatant.status === "out") card.classList.add("out");
  if (combatant.status === "down") card.classList.add("down");

  const head = document.createElement("div");
  head.className = "battle-unit-head";

  const name = document.createElement("span");
  name.className = "battle-unit-name";
  name.textContent = combatant.name;

  const hpNum = document.createElement("span");
  hpNum.className = "battle-unit-hp";
  hpNum.textContent = `${combatant.hp} / ${combatant.maxHp}`;

  head.append(name, hpNum);

  const bar = document.createElement("div");
  bar.className = "hpbar";
  const fill = document.createElement("div");
  fill.className = "hpbar-fill";
  fill.style.width = `${Math.max(0, (combatant.hp / combatant.maxHp) * 100)}%`;
  bar.appendChild(fill);

  card.append(head, bar);
  return card;
}

function renderBattle() {
  if (!battle) return;

  battleTitleEl.textContent = battle.dungeonName;

  battlePartyEl.innerHTML = "";
  battle.party.forEach((c) => battlePartyEl.appendChild(battleUnitCard(c)));

  battleEnemiesEl.innerHTML = "";
  battle.enemies.forEach((c) => battleEnemiesEl.appendChild(battleUnitCard(c)));

  if (battle.result) {
    battleResultEl.classList.remove("hidden");
    battleResultEl.classList.toggle("victory", battle.result === "victory");
    battleResultEl.classList.toggle("defeat", battle.result === "defeat");
    battleResultEl.textContent =
      battle.result === "victory" ? "Victory!" : "Defeat…";
  } else {
    battleResultEl.classList.add("hidden");
  }

  battleLogEl.innerHTML = "";
  battle.log.forEach((entry) => {
    const line = document.createElement("div");
    line.className = `log-line ${entry.kind}`;
    line.textContent = entry.text;
    battleLogEl.appendChild(line);
  });
  battleLogEl.scrollTop = battleLogEl.scrollHeight;
}

function renderDungeonList() {
  dungeonListEl.innerHTML = "";
  DUNGEONS.forEach((dungeon) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "dungeon-card";

    const name = document.createElement("span");
    name.className = "dungeon-card-name";
    name.textContent = dungeon.name;

    const rec = document.createElement("span");
    rec.className = "dungeon-card-rec";
    rec.textContent = `Recommended ${dungeon.recommendation}`;

    card.append(name, rec);
    card.addEventListener("click", () => openDungeon(dungeon.id));
    dungeonListEl.appendChild(card);
  });
}

function renderDungeonDetail() {
  const dungeon = getDungeon(state.selectedDungeonId);
  if (!dungeon) return backToDungeonList();

  dungeonNameEl.textContent = dungeon.name;
  dungeonRecEl.textContent = `Recommended ${dungeon.recommendation}`;
  enterNoteEl.classList.add("hidden");

  enemyListEl.innerHTML = "";
  dungeon.enemies.forEach((enemyId) => {
    const enemy = ENEMIES[enemyId];
    if (!enemy) return;
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "enemy-entry";
    entry.textContent = enemy.name;
    entry.addEventListener("click", () => openEnemy(enemyId));
    enemyListEl.appendChild(entry);
  });
}

function renderEnemyDetail() {
  const enemy = ENEMIES[state.selectedEnemyId];
  if (!enemy) return backToDungeonDetail();

  enemyNameEl.textContent = enemy.name;
  enemyStatsEl.innerHTML = "";
  ENEMY_STAT_ORDER.forEach((label) => {
    const row = document.createElement("div");
    row.className = "stat-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "stat-label";
    nameSpan.textContent = label;

    const valueSpan = document.createElement("span");
    valueSpan.className = "stat-value";
    valueSpan.textContent = formatValue(label, enemy.stats[label]);

    row.append(nameSpan, valueSpan);
    enemyStatsEl.appendChild(row);
  });
}

function render() {
  goldEl.textContent = state.gold;
  countEl.textContent = state.adventurers.length;
  maxEl.textContent = state.maxAdventurers;

  const rosterFull = state.adventurers.length >= state.maxAdventurers;
  const tooPoor = state.gold < HIRE_COST;
  hireBtn.disabled = rosterFull || tooPoor;

  renderRoster();
  renderStatsheet();
}

// --- Setup ---------------------------------------------------------------

function init() {
  renderClassChoices();

  hireBtn.addEventListener("click", hireNewbie);
  nameEl.addEventListener("input", (e) => renameSelected(e.target.value));
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  viewNavButtons.forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
  dungeonBackBtn.addEventListener("click", backToDungeonList);
  dungeonEnterBtn.addEventListener("click", enterDungeon);
  enemyBackBtn.addEventListener("click", backToDungeonDetail);
  enemyCopyBtn.addEventListener("click", copyEnemy);
  battleBackBtn.addEventListener("click", leaveBattle);

  // Allow cancelling a hire by clicking the backdrop or pressing Escape.
  classModalEl.addEventListener("click", (e) => {
    if (e.target === classModalEl && classModalEl.dataset.cancelable === "true") {
      closeClassPicker();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      !classModalEl.classList.contains("hidden") &&
      classModalEl.dataset.cancelable === "true"
    ) {
      closeClassPicker();
    }
  });

  // Player starts with 1000 gold and an empty roster: just the hire button is
  // shown. Hiring the first newbie triggers class selection and the statsheet
  // pops up once a roster exists.
  render();
}

init();
