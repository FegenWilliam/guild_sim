// Items — equipment slots and personal inventory.
// Nothing can be equipped or picked up yet; this is the scaffolding an item
// system will fill in later. Slots exist on the model and render as "Empty".
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
