// Adventurers UI — the roster, statsheet, tabs, and the class picker modal.
// Reads adventurer state and renders it; handles hire/select/rename actions.

// --- Actions -------------------------------------------------------------

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

// Top-level render for the adventurers view: topbar + roster + statsheet.
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
