// Save/Load — persists progress to the browser so a refresh no longer wipes the
// guild, and supports exporting/importing a save file to move progress between
// browsers or back it up.
//
// Only gameplay state is persisted. Transient UI and battle state (which view is
// open, an in-progress dungeon run) is deliberately left out, so a reload always
// lands on a clean menu with the roster and gold intact.

const SAVE_KEY = "guildSim.save";
const SAVE_VERSION = 1;

const SAVED_FIELDS = ["gold", "day", "maxAdventurers", "adventurers", "enchantStones", "selectedId", "nextId"];

// Snapshot the persistable slice of `state` into a plain, serializable object.
function serializeSave() {
  const data = { version: SAVE_VERSION };
  for (const field of SAVED_FIELDS) data[field] = state[field];
  return data;
}

// Copy a loaded snapshot back into `state`, then repair the selection so it
// always points at a real adventurer (or nothing). Returns whether it took.
function applySave(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.adventurers)) {
    return false;
  }
  for (const field of SAVED_FIELDS) {
    if (field in data) state[field] = data[field];
  }
  // Enchantment stones: saves before the enchantment system lack the wallet
  // entirely, and a newer tier could be missing from an in-between save. Start
  // from a full zeroed wallet and copy over whatever counts were stored.
  const stones = emptyEnchantStones();
  if (data.enchantStones && typeof data.enchantStones === "object") {
    for (const tier of ENCHANT_TIERS) {
      const n = data.enchantStones[tier.id];
      if (typeof n === "number" && n >= 0) stones[tier.id] = n;
    }
  }
  state.enchantStones = stones;
  // Normalize adventurers from older saves, which may predate persistent HP/MP,
  // the skill system, or the switch of `skills` from a list to a level map.
  state.adventurers.forEach((a) => {
    if (typeof a.hp !== "number") a.hp = maxHp(a);
    if (typeof a.mp !== "number") a.mp = maxMp(a);

    // Inventory now holds loot/equipment items; older saves left it empty.
    // Guard the shape and default `locked` on any item that predates it.
    if (!Array.isArray(a.inventory)) a.inventory = [];
    a.inventory.forEach((item) => {
      if (item && typeof item.locked !== "boolean") item.locked = false;
      // Equipment always carries EQUIPMENT_MODIFIER_SLOTS modifier slots for
      // enchantments; backfill any that predate the reserved slots.
      if (isEquipment(item) && !Array.isArray(item.modifiers)) {
        item.modifiers = new Array(EQUIPMENT_MODIFIER_SLOTS).fill(null);
      }
    });

    // `skills` used to be an array of learned ids; it's now a { id: level } map.
    // Migrate an old array (each learned skill starts at Lv 1) and coerce
    // anything unexpected to an empty map.
    if (Array.isArray(a.skills)) {
      const map = {};
      a.skills.forEach((id) => { map[id] = 1; });
      a.skills = map;
    } else if (!a.skills || typeof a.skills !== "object") {
      a.skills = {};
    }
    // Ensure the class starter is always present at Lv 1.
    const starter = starterSkillForClass(a.className);
    if (starter && !a.skills[starter.id]) a.skills[starter.id] = 1;

    // Skill points: grant the level-ups already earned to pre-skill-system
    // adventurers so their banked levels aren't lost.
    if (typeof a.skillPoints !== "number") a.skillPoints = Math.max(0, a.level - 1);
    if (a.strategy !== "highest" && a.strategy !== "lowest") a.strategy = "lowest";

    // Once-per-day enchantment charges: default for saves that predate them.
    if (!a.enchantDaily || typeof a.enchantDaily !== "object") {
      a.enchantDaily = { mpBoost: false, lastStand: false };
    }
  });
  if (!state.adventurers.some((a) => a.id === state.selectedId)) {
    state.selectedId = state.adventurers.length ? state.adventurers[0].id : null;
  }
  return true;
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeSave()));
  } catch (err) {
    // Storage can be unavailable (private mode, quota, file://) — never let a
    // failed save break the game.
  }
}

// Load the saved game into `state`. Returns true if a save was applied.
function loadGame() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return false;
  }
  if (!raw) return false;
  try {
    return applySave(JSON.parse(raw));
  } catch (err) {
    return false;
  }
}

// Debounced save for hot paths like typing a name, where a write per keystroke
// would be wasteful.
let saveTimer = null;
function scheduleSave() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveGame();
  }, 400);
}

// Download the current save as a JSON file the player can keep or re-import.
function exportSave() {
  const text = JSON.stringify(serializeSave(), null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `guild-sim-save-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Read a picked save file and apply it, replacing current progress. `onDone` is
// called with whether the import succeeded.
function importSaveFile(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    let ok = false;
    try {
      ok = applySave(JSON.parse(reader.result));
    } catch (err) {
      ok = false;
    }
    if (ok) saveGame();
    onDone(ok);
  };
  reader.onerror = () => onDone(false);
  reader.readAsText(file);
}

// Briefly show a status message next to the save controls.
function flashSaveNote(message) {
  if (!saveNoteEl) return;
  saveNoteEl.textContent = message;
  clearTimeout(flashSaveNote._timer);
  flashSaveNote._timer = setTimeout(() => {
    saveNoteEl.textContent = "";
  }, 2500);
}
