// Items — equipment slots, personal inventory, and the two item kinds that
// fill them: Loot and Equipment.
//
// There are two things an inventory slot can hold, both tagged by `type`:
//   Loot       — what enemies drop. Just a name and a sell price; no stats.
//                { type: "loot", name: "Rusty Sword", price: 8, locked: false }
//   Equipment  — gear you buy in the shop and (later) wear. Carries stat
//                bonuses and six modifier slots reserved for enchantments.
//                { type: "equipment", equipId: "ironSword", name: "Iron Sword",
//                  slot: "weapon", bonuses: [...], modifiers: [null × 6],
//                  locked: false }
//
// A `locked` item is protected from "Sell All Loot" (double-click a slot to
// toggle it). Loot is the thing that gets sold; locking a piece keeps it.
//
// Equipment stat bonuses are a list of descriptors, each either:
//   flat:   { stat: "ATK", value: 10 }                 → +10 ATK
//   scaled: { stat: "ATK", perStat: "DEX", mult: 2 }   → +(2× DEX) ATK
// (Crossbow combines both.) Only flat bonuses fold into a wearer's statline for
// now; scaled bonuses depend on the wearer and land when equipping is wired up.
//
// A weapon (or any gear) may also carry an innate `dot`, a damage-over-time it
// applies on hit — the non-enchantment path into the DOT system (systems/dot.js):
//   dot: { key: "poison", percent: 30, turns: 3, label: "is poisoned for" }
// `percent` is the share of each hit that becomes the per-turn tick, `key` lets
// distinct DOT types (poison vs a Blazing burn) stack, and `label` is the log
// verb. This is a property of the item itself, wholly separate from enchantments.
//
// Active slots: helmet, chestpiece, leg armor, boots, weapon, one accessory,
// and a bag. A second accessory slot lives in the model but is `locked`, so it
// stays hidden until it's unlocked later (e.g. via a guild perk). Rendering
// skips locked slots; flipping `locked` to false is all it takes to reveal it.
//
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

// Flat stat bonuses contributed by all equipped gear (bag excluded). Sums each
// item's flat bonus descriptors into a { stat: total } map. Scaled bonuses
// (per-primary) depend on the wearer, so they're skipped here — they'll be
// applied in the equip-time math once wearing gear is wired up. Nothing can be
// equipped through the UI yet, so in practice this returns an empty map.
function equipmentBonuses(adventurer) {
  const totals = {};
  for (const slot of EQUIPMENT_SLOTS) {
    if (slot.id === BAG_SLOT) continue;
    const item = adventurer.equipment[slot.id];
    if (!item) continue;
    for (const b of item.bonuses || []) {
      if (b.perStat) continue; // scaled bonus — not folded in yet
      totals[b.stat] = (totals[b.stat] || 0) + b.value;
    }
    // Rolled enchantment modifiers are flat { stat, value } descriptors and
    // stack on top just like flat gear bonuses.
    for (const mod of item.modifiers || []) {
      if (!mod) continue;
      totals[mod.stat] = (totals[mod.stat] || 0) + mod.value;
    }
  }
  return totals;
}

// Every adventurer carries a personal inventory. Without a bag they get
// BASE_INVENTORY_SLOTS; equipping a bag unlocks its `inventorySlots` bonus on
// top, up to MAX_INVENTORY_SLOTS. The inventory menu always draws the full MAX
// grid and locks the slots that aren't unlocked yet.
const BASE_INVENTORY_SLOTS = 4;
const MAX_INVENTORY_SLOTS = 40;

// How many inventory slots this adventurer currently has unlocked.
function inventorySlots(adventurer) {
  const bag = adventurer.equipment[BAG_SLOT];
  const bonus = bag ? bag.inventorySlots || 0 : 0;
  return Math.min(MAX_INVENTORY_SLOTS, BASE_INVENTORY_SLOTS + bonus);
}

// Is there a free slot to drop a picked-up item into?
function inventoryHasSpace(adventurer) {
  return adventurer.inventory.length < inventorySlots(adventurer);
}

// Push an item onto an adventurer's inventory if a slot is free. Returns whether
// it fit. The inventory is a dense array (index === slot), so a plain push lands
// the item in the next open slot.
function addToInventory(adventurer, item) {
  if (!inventoryHasSpace(adventurer)) return false;
  adventurer.inventory.push(item);
  return true;
}

// --- Equipping -------------------------------------------------------------
//
// An equipment item's `slot` names the slot it goes in (matching an
// EQUIPMENT_SLOTS id). Equipping moves it from the bag onto the body; if that
// slot was already filled, the old piece swaps back into the freed bag space.
// A bag *is* equipment too, so swapping to a smaller bag (or unequipping one)
// can shrink capacity — those moves are refused when they'd overflow the bag.

// Equip the inventory item at `index` into its matching slot. Returns whether it
// equipped (false if it isn't equipment, its slot is missing/locked, or a bag
// swap would leave the bag over capacity).
function equipFromInventory(adventurer, index) {
  const item = adventurer.inventory[index];
  if (!isEquipment(item)) return false;
  const slot = EQUIPMENT_SLOTS.find((s) => s.id === item.slot);
  if (!slot || slot.locked) return false;

  const prev = adventurer.equipment[item.slot];
  adventurer.equipment[item.slot] = item;
  adventurer.inventory.splice(index, 1);

  // Any displaced piece returns to the bag. With `equipment` already updated,
  // inventorySlots() reflects the new bag, so this also catches a shrinking
  // bag swap that leaves no room for the old one.
  if (prev) {
    if (adventurer.inventory.length + 1 > inventorySlots(adventurer)) {
      adventurer.inventory.splice(index, 0, item); // undo
      adventurer.equipment[item.slot] = prev;
      return false;
    }
    adventurer.inventory.push(prev);
  } else if (adventurer.inventory.length > inventorySlots(adventurer)) {
    adventurer.inventory.splice(index, 0, item); // undo (shrinking bag)
    adventurer.equipment[item.slot] = null;
    return false;
  }
  return true;
}

// Unequip the item in `slotId` back into the bag. Returns whether it came off
// (false if the slot is empty, or removing a bag would shrink capacity below
// what's already carried — the bag itself needs a slot too).
function unequipToInventory(adventurer, slotId) {
  const item = adventurer.equipment[slotId];
  if (!item) return false;

  adventurer.equipment[slotId] = null;
  if (adventurer.inventory.length + 1 > inventorySlots(adventurer)) {
    adventurer.equipment[slotId] = item; // undo
    return false;
  }
  adventurer.inventory.push(item);
  return true;
}

// --- Loot ------------------------------------------------------------------

// A fresh inventory item from a loot drop (see enemies.js loot tables).
function createLootItem(loot) {
  return { type: "loot", name: loot.name, price: loot.price, locked: false };
}

function isLoot(item) {
  return !!item && item.type === "loot";
}

// --- Equipment -------------------------------------------------------------

// Every piece of equipment reserves this many modifier slots for the (upcoming)
// enchantment feature. They start empty and stay open until enchanting is added.
const EQUIPMENT_MODIFIER_SLOTS = 6;

// The equipment shop's stock. Each entry is a template; buying one mints a fresh
// inventory instance (with its own empty modifier slots) via createEquipmentItem.
const SHOP_EQUIPMENT = [
  {
    id: "ironSword",
    name: "Iron Sword",
    slot: "weapon",
    price: 120,
    bonuses: [{ stat: "ATK", value: 10 }],
  },
  {
    id: "wand",
    name: "Wand",
    slot: "weapon",
    price: 120,
    bonuses: [{ stat: "MATK", value: 10 }],
  },
  {
    id: "crossbow",
    name: "Crossbow",
    slot: "weapon",
    price: 160,
    // +(2× DEX) + 2 ATK — a scaling weapon that rewards a high-DEX wielder.
    bonuses: [
      { stat: "ATK", perStat: "DEX", mult: 2 },
      { stat: "ATK", value: 2 },
    ],
  },
  {
    id: "tunic",
    name: "Tunic",
    slot: "chest",
    price: 90,
    bonuses: [{ stat: "DEF", value: 4 }],
  },
  {
    // A weapon whose bite lingers: every hit poisons the target for 30% of the
    // damage over 3 turns — an innate DOT, no enchantment required.
    id: "venomFang",
    name: "Venom Fang",
    slot: "weapon",
    price: 200,
    bonuses: [{ stat: "ATK", value: 6 }],
    dot: { key: "poison", percent: 30, turns: 3, label: "is poisoned for" },
  },
];

function shopItemById(id) {
  return SHOP_EQUIPMENT.find((e) => e.id === id) || null;
}

function isEquipment(item) {
  return !!item && item.type === "equipment";
}

// Mint a fresh inventory instance of a shop equipment template. Bonuses are
// copied (so a template is never mutated) and six empty modifier slots are
// reserved for enchantments.
function createEquipmentItem(def) {
  const item = {
    type: "equipment",
    equipId: def.id,
    name: def.name,
    slot: def.slot,
    bonuses: def.bonuses.map((b) => ({ ...b })),
    modifiers: new Array(EQUIPMENT_MODIFIER_SLOTS).fill(null),
    locked: false,
  };
  // Innate damage-over-time rides along on the instance so it persists in saves.
  if (def.dot) item.dot = { ...def.dot };
  return item;
}

// Human-readable text for an item's innate DOT, e.g. "Poison — 30% of hit / 3
// turns". Returns "" for gear with no innate DOT.
function formatItemDot(dot) {
  if (!dot) return "";
  const name = dot.key ? dot.key[0].toUpperCase() + dot.key.slice(1) : "DOT";
  return `${name} — ${dot.percent}% of hit / ${dot.turns} turns`;
}

// Human-readable text for one equipment bonus descriptor:
//   flat   → "+10 ATK"
//   scaled → "+(2× DEX) ATK"
function formatBonus(b) {
  if (b.perStat) return `+(${b.mult}× ${b.perStat}) ${b.stat}`;
  return `+${b.value} ${b.stat}`;
}

// The display label for an equipment slot id (e.g. "weapon" → "Weapon").
function slotLabel(slotId) {
  const slot = EQUIPMENT_SLOTS.find((s) => s.id === slotId);
  return slot ? slot.label : slotId;
}
