// Enchanter UI — the Town service that spends enchantment stones on gear.
//
// Stones are a guild-wide counted resource (state.enchantStones), not inventory
// items, so the wallet at the top is always shown. The Enchanter works on the
// adventurer selected in the Adventurers menu, mirroring how the shop buys for
// the selected adventurer.
//
// Two screens, switched by state.enchantItemIndex:
//   grid   — the selected adventurer's enchantable equipment (index null)
//   detail — one item's six modifier slots + a roll button per stone tier:
//            tap a slot to select it, tap a tier to spend one stone and roll a
//            modifier into that slot (overwriting whatever was there).

// The equipment currently being enchanted, resolved from the selected
// adventurer and the stored inventory index. Returns { adventurer, item, index }
// or null when nothing valid is targeted (no selection, or the slot no longer
// holds equipment because it was sold/moved).
function selectedEnchantItem() {
  const adventurer = getSelected();
  if (!adventurer) return null;
  const item = adventurer.inventory[state.enchantItemIndex];
  if (!isEquipment(item)) return null;
  return { adventurer, item, index: state.enchantItemIndex };
}

// --- Navigation ------------------------------------------------------------

function openEnchantItem(index) {
  state.enchantItemIndex = index;
  state.enchantSlotIndex = null;
  renderEnchant();
}

function backToEnchantGrid() {
  state.enchantItemIndex = null;
  state.enchantSlotIndex = null;
  renderEnchant();
}

function selectEnchantSlot(i) {
  state.enchantSlotIndex = i;
  renderEnchant();
}

// Spend one stone of `tierId` to roll a modifier into the selected slot. Guards
// on a chosen slot and an available stone, then overwrites the slot with the
// fresh roll and persists (render → scheduleSave, like the shop's Buy).
function rollEnchantSlot(tierId) {
  const target = selectedEnchantItem();
  if (!target) return;

  const slot = state.enchantSlotIndex;
  if (slot === null || slot === undefined) {
    renderEnchant();
    showEnchantNote("Tap a modifier slot to roll into first.");
    return;
  }
  if ((state.enchantStones[tierId] || 0) <= 0) {
    renderEnchant();
    showEnchantNote(`No ${enchantTierById(tierId).name} stones left.`);
    return;
  }

  const mod = rollEnchantment(tierId);
  if (!mod) return;
  state.enchantStones[tierId] -= 1;
  target.item.modifiers[slot] = mod;

  render(); // refresh the wallet-adjacent topbar + statsheet, and autosave
  renderEnchant();
  showEnchantNote(`Slot ${slot + 1}: rolled ${formatModifier(mod)}.`);
}

// --- Rendering -------------------------------------------------------------

function renderEnchant() {
  renderStoneWallet();

  // A stale index (item sold, or no adventurer selected) falls back to the grid.
  const target = selectedEnchantItem();
  if (state.enchantItemIndex !== null && !target) {
    state.enchantItemIndex = null;
    state.enchantSlotIndex = null;
  }
  const onDetail = !!target;

  enchantDetailEl.classList.toggle("hidden", !onDetail);
  enchantGridEl.classList.toggle("hidden", onDetail);
  if (onDetail) enchantEmptyEl.classList.add("hidden");

  if (onDetail) renderEnchantDetail(target);
  else renderEnchantGrid();
}

// The stone wallet: one chip per tier with its current count. Always visible so
// the player can see what they can afford before opening an item.
function renderStoneWallet() {
  stoneWalletEl.innerHTML = "";
  ENCHANT_TIERS.forEach((tier) => {
    const chip = document.createElement("div");
    chip.className = "stone-chip";
    chip.dataset.tier = tier.id;

    const name = document.createElement("span");
    name.className = "stone-chip-name";
    name.textContent = tier.name;

    const count = document.createElement("span");
    count.className = "stone-chip-count";
    count.textContent = state.enchantStones[tier.id] || 0;

    chip.append(name, count);
    stoneWalletEl.appendChild(chip);
  });
}

function renderEnchantGrid() {
  enchantGridEl.innerHTML = "";

  const adventurer = getSelected();
  if (!adventurer) {
    enchantEmptyEl.textContent =
      "Select an adventurer in the Adventurers menu to enchant their gear.";
    enchantEmptyEl.classList.remove("hidden");
    return;
  }

  // Pair each equipment item with its inventory index so a roll targets the
  // exact instance, then keep only the equipment (loot can't be enchanted).
  const entries = adventurer.inventory
    .map((item, index) => ({ item, index }))
    .filter((e) => isEquipment(e.item));

  if (!entries.length) {
    enchantEmptyEl.textContent = `${displayName(adventurer)} has no equipment — buy gear in the Equipment Shop.`;
    enchantEmptyEl.classList.remove("hidden");
    return;
  }
  enchantEmptyEl.classList.add("hidden");

  entries.forEach(({ item, index }) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "shop-card enchant-card";

    const name = document.createElement("span");
    name.className = "shop-card-name";
    name.textContent = item.name;

    const slot = document.createElement("span");
    slot.className = "shop-card-bonus";
    slot.textContent = slotLabel(item.slot);

    const count = document.createElement("span");
    count.className = "enchant-card-count";
    const filled = (item.modifiers || []).filter(Boolean).length;
    count.textContent = `${filled}/${EQUIPMENT_MODIFIER_SLOTS} enchanted`;

    card.append(name, slot, count);
    card.addEventListener("click", () => openEnchantItem(index));
    enchantGridEl.appendChild(card);
  });
}

function renderEnchantDetail({ item }) {
  enchantItemNameEl.textContent = item.name;
  enchantItemSlotEl.textContent = `Slot: ${slotLabel(item.slot)}`;

  enchantBonusesEl.innerHTML = "";
  (item.bonuses || []).forEach((b) => {
    const row = document.createElement("div");
    row.className = "shop-bonus";
    row.textContent = formatBonus(b);
    enchantBonusesEl.appendChild(row);
  });

  // Six clickable modifier slots. A filled slot shows its rolled modifier and
  // carries a data-tier for its rarity color; the selected one is highlighted.
  enchantModifiersEl.innerHTML = "";
  for (let i = 0; i < EQUIPMENT_MODIFIER_SLOTS; i++) {
    const mod = item.modifiers[i];
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "modifier-slot" + (mod ? " filled" : " empty");
    if (i === state.enchantSlotIndex) cell.classList.add("selected");
    if (mod) cell.dataset.tier = mod.tier;
    cell.textContent = formatModifier(mod);
    cell.addEventListener("click", () => selectEnchantSlot(i));
    enchantModifiersEl.appendChild(cell);
  }

  renderEnchantRolls();

  enchantNoteEl.classList.add("hidden");
  enchantNoteEl.textContent = "";
}

// One roll button per tier, showing its stock. A button is live only when a
// slot is selected and at least one stone of that tier is on hand.
function renderEnchantRolls() {
  enchantRollsEl.innerHTML = "";
  const slotChosen = state.enchantSlotIndex !== null && state.enchantSlotIndex !== undefined;
  ENCHANT_TIERS.forEach((tier) => {
    const count = state.enchantStones[tier.id] || 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "roll-btn";
    btn.dataset.tier = tier.id;
    btn.textContent = `Roll ${tier.name} (${count})`;
    btn.disabled = count <= 0 || !slotChosen;
    btn.addEventListener("click", () => rollEnchantSlot(tier.id));
    enchantRollsEl.appendChild(btn);
  });
}

function showEnchantNote(message) {
  enchantNoteEl.textContent = message;
  enchantNoteEl.classList.remove("hidden");
}
