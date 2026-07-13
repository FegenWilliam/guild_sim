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
  equipPickerSlot = null; // close any open picker from the previous adventurer
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
  // Renaming skips the full render (to keep the caret), so save explicitly.
  scheduleSave();
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

// --- Confirmation modal --------------------------------------------------

let pendingConfirm = null;

// Show an "are you sure?" dialog. `onConfirm` runs only if the player accepts.
function openConfirm({ title, message, okLabel = "Confirm", onConfirm }) {
  pendingConfirm = onConfirm;
  confirmTitleEl.textContent = title;
  confirmMsgEl.textContent = message;
  confirmOkBtn.textContent = okLabel;
  confirmModalEl.classList.remove("hidden");
}

function closeConfirm() {
  pendingConfirm = null;
  confirmModalEl.classList.add("hidden");
}

function acceptConfirm() {
  const onConfirm = pendingConfirm;
  closeConfirm();
  if (onConfirm) onConfirm();
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
  xpTextEl.textContent = `${formatXP(selected.xp)} / ${needed} XP`;

  // Current HP and MP persist between runs (both refill on Pass Day), so
  // surface them here.
  const hp = currentHp(selected);
  const max = maxHp(selected);
  hpFillEl.style.width = `${Math.max(0, Math.min(100, (hp / max) * 100))}%`;
  hpTextEl.textContent = `${hp} / ${max} HP`;

  const mp = currentMp(selected);
  const mpMax = maxMp(selected);
  mpFillEl.style.width = `${Math.max(0, Math.min(100, (mp / mpMax) * 100))}%`;
  mpTextEl.textContent = `${mp} / ${mpMax} MP`;

  renderStats(selected);
  renderEquipment(selected);
  renderInventory(selected);
  renderSkills(selected);
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

// Which empty slot has its "pick an item" list open, or null. Transient UI —
// never saved, and reset whenever the selection changes.
let equipPickerSlot = null;

// The bag items that fit a given slot, paired with their inventory index.
function equippableForSlot(adventurer, slotId) {
  const out = [];
  adventurer.inventory.forEach((item, index) => {
    if (isEquipment(item) && item.slot === slotId) out.push({ item, index });
  });
  return out;
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
    valueSpan.textContent = item ? item.name : "Empty";
    if (item) valueSpan.title = itemTooltip(item);

    // Filled slots offer Unequip; empty slots open a picker of matching gear.
    const action = document.createElement("button");
    action.type = "button";
    action.className = "equip-btn";
    if (item) {
      action.textContent = "Unequip";
      action.addEventListener("click", () => unequipSlot(selected, slot.id));
    } else {
      const open = equipPickerSlot === slot.id;
      const candidates = equippableForSlot(selected, slot.id);
      action.textContent = open ? "Cancel" : "Equip";
      action.disabled = !open && candidates.length === 0;
      action.addEventListener("click", () => toggleEquipPicker(slot.id));
    }

    row.append(nameSpan, valueSpan, action);
    equipmentEl.appendChild(row);

    // Inline list of bag items that fit this open, empty slot.
    if (!item && equipPickerSlot === slot.id) {
      const picker = document.createElement("div");
      picker.className = "equip-picker";
      const candidates = equippableForSlot(selected, slot.id);
      if (!candidates.length) {
        const none = document.createElement("p");
        none.className = "equip-picker-empty";
        none.textContent = "No gear in the bag for this slot.";
        picker.appendChild(none);
      } else {
        candidates.forEach(({ item: bagItem, index }) => {
          const opt = document.createElement("button");
          opt.type = "button";
          opt.className = "equip-option";
          opt.textContent = bagItem.name;
          opt.title = itemTooltip(bagItem);
          opt.addEventListener("click", () => equipFromBag(selected, index));
          picker.appendChild(opt);
        });
      }
      equipmentEl.appendChild(picker);
    }
  });
}

// Open/close the item picker under an empty slot (only one open at a time).
function toggleEquipPicker(slotId) {
  equipPickerSlot = equipPickerSlot === slotId ? null : slotId;
  renderEquipment(getSelected());
}

// Equip the bag item at `index`; a full re-render refreshes the statline (gear
// bonuses and enchantments now count), the bag grid, and autosaves.
function equipFromBag(adventurer, index) {
  if (equipFromInventory(adventurer, index)) {
    equipPickerSlot = null;
    render();
  }
}

function unequipSlot(adventurer, slotId) {
  if (!unequipToInventory(adventurer, slotId)) {
    flashSaveNote("Bag is full — free a slot first.");
    return;
  }
  render();
}

// A hover tooltip describing an inventory item.
function itemTooltip(item) {
  if (isLoot(item)) return `${item.name} — sells for ${item.price}g`;
  if (isEquipment(item)) {
    let text = `${item.name} (${slotLabel(item.slot)}) — ${item.bonuses.map(formatBonus).join(", ")}`;
    if (item.dot) text += ` · ${formatItemDot(item.dot)}`;
    return text;
  }
  return item.name;
}

// Draw the full inventory grid: every slot up to MAX_INVENTORY_SLOTS, with the
// ones past the adventurer's unlocked count shown as locked. Unlocked slots show
// whatever loot/equipment sits in them; double-clicking a filled slot toggles
// the item's lock (a locked item is protected from Sell All Loot).
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
      const item = selected.inventory[i];
      cell.classList.toggle("empty", !item);
      if (item) {
        cell.classList.add("filled");
        cell.classList.toggle("loot", isLoot(item));
        cell.classList.toggle("equipment", isEquipment(item));
        cell.classList.toggle("locked-item", !!item.locked);
        cell.textContent = item.name;
        cell.title = itemTooltip(item) + (item.locked ? " · locked" : "");
        cell.addEventListener("dblclick", () => toggleItemLock(selected, i));
      }
    }

    inventoryEl.appendChild(cell);
  }
}

// Toggle an inventory item's lock (double-click). A locked item is kept when
// selling loot. Re-renders just the grid and saves — no full render needed.
function toggleItemLock(adventurer, index) {
  const item = adventurer.inventory[index];
  if (!item) return;
  item.locked = !item.locked;
  renderInventory(adventurer);
  scheduleSave();
}

// Sell every unlocked loot item across the whole guild for its price in gold.
// Equipment and any locked item are left untouched.
function sellAllLoot() {
  let earned = 0;
  let count = 0;
  state.adventurers.forEach((a) => {
    const kept = [];
    a.inventory.forEach((item) => {
      if (isLoot(item) && !item.locked) {
        earned += item.price;
        count += 1;
      } else {
        kept.push(item);
      }
    });
    a.inventory = kept;
  });

  if (count > 0) {
    state.gold += earned;
    flashSaveNote(`Sold ${count} loot for ${earned}g.`);
  } else {
    flashSaveNote("No loot to sell.");
  }
  render();
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
  dayEl.textContent = state.day;
  goldEl.textContent = state.gold;
  countEl.textContent = state.adventurers.length;
  maxEl.textContent = state.maxAdventurers;

  const rosterFull = state.adventurers.length >= state.maxAdventurers;
  const tooPoor = state.gold < HIRE_COST;
  hireBtn.disabled = rosterFull || tooPoor;

  renderRoster();
  renderStatsheet();

  // Any full render follows a meaningful state change (hire, select, XP gain,
  // gold spent), so it's the natural place to persist progress.
  scheduleSave();
}
