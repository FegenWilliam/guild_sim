// Town UI — the Town view and its services. Town is a hub of services the
// player visits between dungeon runs; the first (and, for now, only) one is the
// Equipment Shop, which sells gear for gold.
//
// The shop has two screens, switched by state.shopScreen:
//   "grid"   — the stock as a clickable grid of items
//   "detail" — one item's page: its bonuses, its (empty) modifier slots, and a
//              Buy button. Bought gear lands in the selected adventurer's bag.

// --- Town service switching ----------------------------------------------

// Only the Equipment Shop exists so far; this is the seam more services slot
// into (each a townnav button + a render branch here).
function setTownService(service) {
  state.townService = service;
  renderTown();
}

function renderTown() {
  townNavButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.town === state.townService);
  });
  // Every service's panel hides unless it's the active one.
  shopServiceEl.classList.toggle("hidden", state.townService !== "shop");
  enchantServiceEl.classList.toggle("hidden", state.townService !== "enchant");
  if (state.townService === "shop") renderShop();
  else if (state.townService === "enchant") renderEnchant();
}

// --- Equipment shop navigation -------------------------------------------

function openShopItem(id) {
  state.shopItemId = id;
  state.shopScreen = "detail";
  renderShop();
}

function backToShopGrid() {
  state.shopScreen = "grid";
  renderShop();
}

function buyEquipment() {
  const def = shopItemById(state.shopItemId);
  if (!def) return;

  // Gear is bought for the adventurer currently selected in the Adventurers
  // menu; it drops straight into their bag.
  const buyer = getSelected();
  if (!buyer) {
    showShopNote("Select an adventurer in the Adventurers menu to buy for.");
    return;
  }
  if (state.gold < def.price) {
    showShopNote("Not enough gold.");
    return;
  }
  if (!inventoryHasSpace(buyer)) {
    showShopNote(`${displayName(buyer)}'s inventory is full.`);
    return;
  }

  state.gold -= def.price;
  addToInventory(buyer, createEquipmentItem(def));
  render(); // updates the gold topbar + inventory grid and autosaves
  renderShop(); // refresh the Buy button's affordability
  showShopNote(`Bought ${def.name} → ${displayName(buyer)}'s inventory.`);
}

// --- Rendering -----------------------------------------------------------

function renderShop() {
  const onDetail = state.shopScreen === "detail" && shopItemById(state.shopItemId);
  shopGridEl.classList.toggle("hidden", !!onDetail);
  shopDetailEl.classList.toggle("hidden", !onDetail);
  if (onDetail) renderShopDetail(shopItemById(state.shopItemId));
  else renderShopGrid();
}

function renderShopGrid() {
  shopGridEl.innerHTML = "";
  SHOP_EQUIPMENT.forEach((def) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "shop-card";

    const name = document.createElement("span");
    name.className = "shop-card-name";
    name.textContent = def.name;

    const bonus = document.createElement("span");
    bonus.className = "shop-card-bonus";
    bonus.textContent = def.bonuses.map(formatBonus).join(", ");

    const price = document.createElement("span");
    price.className = "shop-card-price";
    price.textContent = `${def.price}g`;

    card.append(name, bonus, price);
    card.addEventListener("click", () => openShopItem(def.id));
    shopGridEl.appendChild(card);
  });
}

function renderShopDetail(def) {
  shopItemNameEl.textContent = def.name;
  shopItemSlotEl.textContent = `Slot: ${slotLabel(def.slot)}`;

  shopBonusesEl.innerHTML = "";
  def.bonuses.forEach((b) => {
    const row = document.createElement("div");
    row.className = "shop-bonus";
    row.textContent = formatBonus(b);
    shopBonusesEl.appendChild(row);
  });
  // Innate DOT (e.g. Venom Fang) reads alongside the stat bonuses.
  if (def.dot) {
    const row = document.createElement("div");
    row.className = "shop-bonus shop-dot";
    row.textContent = formatItemDot(def.dot);
    shopBonusesEl.appendChild(row);
  }

  // Six empty modifier slots — reserved for the enchantment feature, kept open.
  shopModifiersEl.innerHTML = "";
  for (let i = 0; i < EQUIPMENT_MODIFIER_SLOTS; i++) {
    const slot = document.createElement("div");
    slot.className = "modifier-slot empty";
    slot.textContent = "Empty";
    shopModifiersEl.appendChild(slot);
  }

  shopPriceEl.textContent = `${def.price}g`;

  const buyer = getSelected();
  const canBuy = buyer && state.gold >= def.price && inventoryHasSpace(buyer);
  shopBuyBtn.disabled = !canBuy;

  shopNoteEl.classList.add("hidden");
  shopNoteEl.textContent = "";
}

function showShopNote(message) {
  shopNoteEl.textContent = message;
  shopNoteEl.classList.remove("hidden");
}
