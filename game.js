// Guild Sim — prototype
// Player manages a roster of adventurers. Each adventurer has a base
// statsheet. Click an adventurer box to select them; the stat page and the
// editable name box reflect the currently selected adventurer.

const HIRE_COST = 1000;
const BASE_MAX_ADVENTURERS = 3;

// The stats every adventurer starts with. Order here is the display order.
const BASE_STATS = {
  HP: 100,
  MP: 30,
  ATK: 12,
  DEF: 8,
  CRIT: 5,       // %
  "CRIT DMG": 150, // %
  EVA: 3,        // %
};

// Stats shown as percentages get a trailing "%" in the stat sheet.
const PERCENT_STATS = new Set(["CRIT", "CRIT DMG", "EVA"]);

const state = {
  gold: 3000,
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
const statsEl = document.getElementById("stats");
const emptyHintEl = document.getElementById("emptyHint");

// --- Model ---------------------------------------------------------------

function createAdventurer() {
  return {
    id: state.nextId++,
    name: "Adventurer",
    stats: { ...BASE_STATS },
  };
}

function getSelected() {
  return state.adventurers.find((a) => a.id === state.selectedId) || null;
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

  statsEl.innerHTML = "";
  Object.entries(selected.stats).forEach(([label, value]) => {
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

// --- Events --------------------------------------------------------------

hireBtn.addEventListener("click", hireNewbie);
nameEl.addEventListener("input", (e) => renameSelected(e.target.value));

render();
