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
// Six slots are active: helmet, chestpiece, leg armor, boots, weapon, and one
// accessory. A second accessory slot lives in the model but is `locked`, so it
// stays hidden until it's unlocked later (e.g. via a guild perk). Rendering
// skips locked slots; flipping `locked` to false is all it takes to reveal it.
const EQUIPMENT_SLOTS = [
  { id: "helmet", label: "Helmet" },
  { id: "chest", label: "Chestpiece" },
  { id: "legs", label: "Leg Armor" },
  { id: "boots", label: "Boots" },
  { id: "weapon", label: "Weapon" },
  { id: "accessory1", label: "Accessory" },
  // Future: second accessory slot, unlocked later. Hidden for now.
  { id: "accessory2", label: "Accessory", locked: true },
];

// A fresh, fully-empty equipment map keyed by slot id (locked slots included,
// so the data is ready the moment a slot is unlocked).
function createEquipment() {
  const equipment = {};
  for (const slot of EQUIPMENT_SLOTS) equipment[slot.id] = null;
  return equipment;
}

// Resolved base derived stats for a class: defaults with its overrides applied.
function classBase(className) {
  return { ...DEFAULT_BASE, ...CLASSES[className].base };
}

// XP required to advance from `level` to `level + 1`.
function xpToNext(level) {
  return level * 100;
}

const state = {
  gold: 1000,
  maxAdventurers: BASE_MAX_ADVENTURERS,
  adventurers: [],
  selectedId: null,
  nextId: 1,
  activeTab: "stats", // "stats" | "equipment"
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
const tabButtons = document.querySelectorAll(".tab");
const emptyHintEl = document.getElementById("emptyHint");
const classModalEl = document.getElementById("classModal");
const classChoicesEl = document.getElementById("classChoices");

// --- Model ---------------------------------------------------------------

function createAdventurer(className) {
  return {
    id: state.nextId++,
    name: "Adventurer",
    className,
    level: 1,
    xp: 0,
    equipment: createEquipment(),
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
  const p = primaryStats(adventurer);
  const b = classBase(adventurer.className);

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

  return {
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

// Show the panel for the active tab and highlight its button.
function applyTab() {
  statsEl.classList.toggle("hidden", state.activeTab !== "stats");
  equipmentEl.classList.toggle("hidden", state.activeTab !== "equipment");
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
  });
}

function setTab(tab) {
  state.activeTab = tab;
  applyTab();
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
