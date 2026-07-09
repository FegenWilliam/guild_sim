// Guild Sim — prototype
// Player manages a roster of adventurers. Each adventurer has a class, a
// level, and a base statsheet. Click an adventurer box to select them; the
// stat page, name box, class picker and level reflect the selected adventurer.

const HIRE_COST = 1000;
const BASE_MAX_ADVENTURERS = 3;

// The stats every adventurer starts with at level 1. Order = display order.
const BASE_STATS = {
  HP: 100,
  MP: 30,
  ATK: 12,
  DEF: 8,
  CRIT: 5,         // %
  "CRIT DMG": 150, // %
  EVA: 3,          // %
};

// Stats shown as percentages get a trailing "%" in the stat sheet.
const PERCENT_STATS = new Set(["CRIT", "CRIT DMG", "EVA"]);

// --- Classes -------------------------------------------------------------
// For now a class is mostly a label, plus a per-level stat-bonus table that
// scaffolds progression. An adventurer's effective stats are:
//     BASE_STATS[stat] + perLevel[stat] * (level - 1)
// so a fresh level-1 adventurer always equals BASE_STATS regardless of class.
//
// TODO: the perLevel numbers below are PLACEHOLDERS for balancing — tune them
// (or replace the whole flat-per-level model with growth curves / stat points)
// once class design is decided. Adding a new class is just another entry here.
const CLASS_NAMES = ["Warrior", "Mage", "Ranger"];
const CLASSES = {
  Warrior: {
    perLevel: { HP: 12, MP: 1, ATK: 3, DEF: 3, CRIT: 0, "CRIT DMG": 0, EVA: 0 },
  },
  Mage: {
    perLevel: { HP: 5, MP: 8, ATK: 1, DEF: 1, CRIT: 1, "CRIT DMG": 2, EVA: 0 },
  },
  Ranger: {
    perLevel: { HP: 8, MP: 3, ATK: 2, DEF: 2, CRIT: 2, "CRIT DMG": 1, EVA: 2 },
  },
};

const DEFAULT_CLASS = "Warrior";

const state = {
  gold: 0,
  maxAdventurers: BASE_MAX_ADVENTURERS,
  adventurers: [],
  selectedId: null,
  nextId: 1,
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
const levelUpBtn = document.getElementById("levelUp");
const statsEl = document.getElementById("stats");
const emptyHintEl = document.getElementById("emptyHint");

// --- Model ---------------------------------------------------------------

function createAdventurer() {
  return {
    id: state.nextId++,
    name: "Adventurer",
    className: DEFAULT_CLASS,
    level: 1,
  };
}

function getSelected() {
  return state.adventurers.find((a) => a.id === state.selectedId) || null;
}

// Effective stats after applying the adventurer's class/level bonuses.
function effectiveStats(adventurer) {
  const bonus = CLASSES[adventurer.className].perLevel;
  const levelsGained = adventurer.level - 1;
  const result = {};
  for (const [stat, base] of Object.entries(BASE_STATS)) {
    result[stat] = base + (bonus[stat] || 0) * levelsGained;
  }
  return result;
}

function hireNewbie() {
  if (state.adventurers.length >= state.maxAdventurers) return;
  if (state.gold < HIRE_COST) return;

  state.gold -= HIRE_COST;
  const adventurer = createAdventurer();
  state.adventurers.push(adventurer);
  state.selectedId = adventurer.id;
  render();
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

function setSelectedClass(className) {
  const selected = getSelected();
  if (!selected || !CLASSES[className]) return;
  selected.className = className;
  render();
}

// TODO: leveling is free/instant for now. Later gate it behind XP or a gold
// training cost, and probably move it out of the stat sheet.
function levelUpSelected() {
  const selected = getSelected();
  if (!selected) return;
  selected.level += 1;
  render();
}

function displayName(adventurer) {
  return adventurer.name.trim() || "Adventurer";
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

function renderStatsheet() {
  const selected = getSelected();

  if (!selected) {
    statsheetEl.classList.add("hidden");
    emptyHintEl.classList.toggle("hidden", state.adventurers.length > 0);
    return;
  }

  statsheetEl.classList.remove("hidden");
  emptyHintEl.classList.add("hidden");

  // Only overwrite the input when its value is stale, so an active edit isn't
  // clobbered mid-keystroke.
  if (nameEl.value !== selected.name) {
    nameEl.value = selected.name;
  }
  classEl.value = selected.className;
  levelEl.textContent = selected.level;

  statsEl.innerHTML = "";
  const stats = effectiveStats(selected);
  Object.entries(stats).forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "stat-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "stat-label";
    nameSpan.textContent = label;

    const valueSpan = document.createElement("span");
    valueSpan.className = "stat-value";
    valueSpan.textContent = PERCENT_STATS.has(label) ? `${value}%` : value;

    row.append(nameSpan, valueSpan);
    statsEl.appendChild(row);
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

function populateClassPicker() {
  classEl.innerHTML = "";
  CLASS_NAMES.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    classEl.appendChild(option);
  });
}

function init() {
  populateClassPicker();

  // Player starts broke but with one free newbie already on the roster.
  const starter = createAdventurer();
  state.adventurers.push(starter);
  state.selectedId = starter.id;

  hireBtn.addEventListener("click", hireNewbie);
  nameEl.addEventListener("input", (e) => renameSelected(e.target.value));
  classEl.addEventListener("change", (e) => setSelectedClass(e.target.value));
  levelUpBtn.addEventListener("click", levelUpSelected);

  render();
}

init();
