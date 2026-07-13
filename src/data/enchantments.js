// Enchantments — the enchantment-stone economy and the rolls that turn a stone
// into a stat modifier on a piece of equipment.
//
// This file is pure data + pure helpers, the single place the tuning lives:
//   - ENCHANT_STAT_MAX  — the *100%* value of every enchantable stat. A roll
//                         lands somewhere between 0% and 100% of these.
//   - ENCHANT_TIERS     — the five rarities, each carrying both its drop odds
//                         (base + per-XP scaling) and its roll band (the % of
//                         the stat max a stone of that tier can roll into).
//
// Enchantment stones are NOT inventory items. They're a guild-wide counted
// resource with no cap (state.enchantStones), so a full bag never blocks a
// drop. Spending one on the Enchanter (ui/enchant.js) rolls a modifier into one
// of an equipment's six modifier slots.

// --- Stat maxes (the "100%" of a roll) -------------------------------------
//
// Editable knobs: raise HP here and every HP enchantment scales with it. A roll
// produces `band% × ENCHANT_STAT_MAX[stat]`, so these are the ceilings a
// Legendary can approach. Percent stats (CRIT / CRIT DMG / EVA) are stored as
// their percentage number (e.g. CRIT 50 = up to +50%).
const ENCHANT_STAT_MAX = {
  STR: 50,
  DEX: 50,
  INT: 50,
  HP: 10000,
  MP: 4000,
  ATK: 250,
  DEF: 250,
  MATK: 250,
  CRIT: 50,         // %
  "CRIT DMG": 300,  // %
  EVA: 40,          // %
};

// The stats a stone can roll, in display order. Just the keys of the max table,
// but pinned to a stable order so rolls read predictably.
const ENCHANT_STATS = [
  "STR", "DEX", "INT", "HP", "MP", "ATK", "MATK", "DEF", "CRIT", "CRIT DMG", "EVA",
];

// --- Tiers ------------------------------------------------------------------
//
// Each tier bundles two independent ideas:
//
//   Drop odds (rolled per enemy kill, per tier, independently):
//     chance% = baseChance + floor(enemyXP / xpStep) × perStep
//   e.g. Common is 1% + 1% for every whole 5 XP the enemy is worth.
//
//   Roll band ([lo, hi] as a percent of ENCHANT_STAT_MAX): the slice of a
//   stat's max this tier rolls into. Common lands in the bottom fifth (0–20%),
//   Legendary in the top fifth (81–100%). Bands are contiguous and editable —
//   widen or shift them here and every future roll follows.
const ENCHANT_TIERS = [
  { id: "common",    name: "Common",    band: [0, 20],    baseChance: 1,   perStep: 1,   xpStep: 5 },
  { id: "uncommon",  name: "Uncommon",  band: [21, 40],   baseChance: 0.5, perStep: 0.5, xpStep: 25 },
  { id: "rare",      name: "Rare",      band: [41, 60],   baseChance: 0,   perStep: 0.2, xpStep: 100 },
  { id: "epic",      name: "Epic",      band: [61, 80],   baseChance: 0,   perStep: 0.1, xpStep: 200 },
  { id: "legendary", name: "Legendary", band: [81, 100],  baseChance: 0,   perStep: 0.1, xpStep: 500 },
];

function enchantTierById(id) {
  return ENCHANT_TIERS.find((t) => t.id === id) || null;
}

// A fresh, all-zero stone wallet keyed by tier id. Used to seed state and to
// backfill older saves that predate the enchantment system.
function emptyEnchantStones() {
  const stones = {};
  for (const tier of ENCHANT_TIERS) stones[tier.id] = 0;
  return stones;
}

// The percent chance a single kill drops one stone of this tier, given the XP
// the enemy is worth. Stepwise: only whole `xpStep` chunks count, so a 6.5-XP
// goblin gives Common 1% + 1%×floor(6.5/5) = 2%, and nothing rarer.
function enchantDropChance(tier, xp) {
  return tier.baseChance + Math.floor(xp / tier.xpStep) * tier.perStep;
}

// Roll every tier's drop independently for one kill worth `xp` XP. Returns the
// list of tier ids that dropped (possibly empty, possibly several at once).
function rollEnchantDrops(xp) {
  const drops = [];
  for (const tier of ENCHANT_TIERS) {
    if (Math.random() * 100 < enchantDropChance(tier, xp)) drops.push(tier.id);
  }
  return drops;
}

// Round a rolled value to how the stat is shown: percents keep 2 decimals,
// everything else snaps to a whole number (no fractional HP/ATK).
function roundEnchantValue(stat, value) {
  if (PERCENT_STATS.has(stat)) return Number(value.toFixed(2));
  return Math.round(value);
}

// === Unique enchantments ====================================================
//
// Uniques aren't raw stats — each is a named effect with its own combat hook
// (wired up in systems/battle.js). They share the tier band system: a unique's
// rolled strength is `band% × number` (its 100% value), so a Legendary stone
// rolls a far stronger effect than a Common one. Two knobs per unique:
//   number  — the 100% ceiling the band scales.
//   chance  — the flat % chance this unique surfaces on any single roll,
//             independent of the stone's tier (1% each, Andragolas 0.1%).
// `flipped` inverts the band (Vampiric: higher rarity → fewer turns, so
// number → 0 as rarity climbs). `rareUnique` only changes how it's labelled.
//
// Sub-effect magnitudes that aren't themselves banded live as named constants
// so they stay easy to retune.
const BLAZING_DURATION = 3;   // turns a Blazing burn lasts
const VAMPIRIC_HEAL = 20;     // % of damage healed when Vampiric procs
const AMPLIFIED_STEP = 50;    // % damage added per repeat cast of a mage skill
const SNIPING_STEP = 25;      // % damage per Sniper's Focus stack
const MP_BOOST_THRESHOLD = 5; // restore MP once it drops below this % of max

const UNIQUE_ENCHANTS = [
  {
    id: "blazing", name: "Blazing", chance: 1, number: 50,
    label: (v) => `Burn for ${v}% of the hit over ${BLAZING_DURATION} turns`,
  },
  {
    id: "vampiric", name: "Vampiric", chance: 1, number: 5, flipped: true,
    label: (v) => `Heal ${VAMPIRIC_HEAL}% of damage every ${v <= 0 ? "turn" : `${v} turns`}`,
  },
  {
    id: "amplified", name: "Amplified Mana", chance: 1, number: 500,
    label: (v) => `Repeat a mage skill for +${AMPLIFIED_STEP}%/cast, up to +${v}%`,
  },
  {
    id: "magicalShield", name: "Magical Shield", chance: 1, number: 250,
    label: (v) => `+${v} DEF against the next hit whenever struck`,
  },
  {
    id: "bigSweep", name: "Big Sweep", chance: 1, number: 50,
    label: (v) => `Warrior skills deal +${v}% per missing AoE target`,
  },
  {
    id: "sniping", name: "Sniping", chance: 1, number: 10,
    label: (v) => `+${SNIPING_STEP}% damage per Sniper's Focus stack (max ${v})`,
  },
  {
    id: "mpBoost", name: "MP Boost", chance: 1, number: 100,
    label: (v) => `Restore ${v}% MP below ${MP_BOOST_THRESHOLD}% MP, once per day`,
  },
  {
    id: "lastStand", name: "Last Stand", chance: 1, number: 10,
    label: (v) => `Survive lethal damage at ${v}% HP, once per day`,
  },
  {
    id: "friendship", name: "Power of Friendship", chance: 1, number: 100,
    label: (v) => `+${v} ATK for every other adventurer in the party`,
  },
  {
    id: "andragolas", name: "Andragolas", chance: 0.1, number: 100, rareUnique: true,
    label: (v) => `+${v}% max HP and +${v}% max MP`,
  },
];

function uniqueById(id) {
  return UNIQUE_ENCHANTS.find((u) => u.id === id) || null;
}

// Roll a unique's banded value: normal uniques scale up with rarity, flipped
// ones (Vampiric) scale down. Rounded to a whole number — every unique's value
// is a count, a flat amount, or a percent that reads cleanly as an integer.
function rollUniqueValue(def, tier) {
  const [lo, hi] = tier.band;
  const f = (lo + Math.random() * (hi - lo)) / 100;
  return Math.round(def.number * (def.flipped ? 1 - f : f));
}

// Every unique already present on an adventurer's equipped gear, keyed by id to
// its best rolled value (highest, or lowest for a flipped unique). Combat reads
// this to know which effects are live. Empty in practice until wearing gear is
// wired up, but the plumbing is ready.
function gatherUniques(adventurer) {
  const out = {};
  for (const slot of EQUIPMENT_SLOTS) {
    if (slot.id === BAG_SLOT) continue;
    const item = adventurer.equipment[slot.id];
    if (!item) continue;
    for (const mod of item.modifiers || []) {
      if (!mod || !mod.unique) continue;
      const def = uniqueById(mod.unique);
      if (!def) continue;
      const cur = out[mod.unique];
      const better = cur === undefined || (def.flipped ? mod.value < cur : mod.value > cur);
      if (better) out[mod.unique] = mod.value;
    }
  }
  return out;
}

// === Rolling ================================================================

// Roll one stone of `tierId` into a modifier for a slot, given the modifiers
// already on the *rest* of the item (`existing`). Enchantments are exclusive:
// no stat or unique may repeat on the same piece, so anything already present
// is excluded. Each roll first checks every eligible unique on its own flat
// chance (a tie between several picks one at random); failing that, it rolls a
// plain stat inside the tier's band. Returns { stat, value, tier } or
// { unique, value, tier }, or null if nothing distinct is left to roll.
function rollEnchantment(tierId, existing) {
  const tier = enchantTierById(tierId);
  if (!tier) return null;

  const usedStats = new Set();
  const usedUniques = new Set();
  for (const m of existing || []) {
    if (!m) continue;
    if (m.unique) usedUniques.add(m.unique);
    else if (m.stat) usedStats.add(m.stat);
  }

  // Uniques first: independent chance each, excluding those already on the item.
  const winners = [];
  for (const def of UNIQUE_ENCHANTS) {
    if (usedUniques.has(def.id)) continue;
    if (Math.random() * 100 < def.chance) winners.push(def);
  }
  if (winners.length) {
    const def = winners[Math.floor(Math.random() * winners.length)];
    return { unique: def.id, value: rollUniqueValue(def, tier), tier: tierId };
  }

  // Otherwise a plain stat, excluding stats already present on the item.
  const pool = ENCHANT_STATS.filter((s) => !usedStats.has(s));
  if (!pool.length) return null;
  const stat = pool[Math.floor(Math.random() * pool.length)];
  const [lo, hi] = tier.band;
  const percent = lo + Math.random() * (hi - lo);
  const value = roundEnchantValue(stat, (percent / 100) * ENCHANT_STAT_MAX[stat]);
  return { stat, value, tier: tierId };
}

// Full description of a rolled modifier, e.g. "+40 ATK", "+12.5% CRIT", or
// "Blazing (Unique) — Burn for 43% of the hit over 3 turns". Used on the
// Enchanter detail and in the roll note.
function formatModifier(mod) {
  if (!mod) return "Empty";
  if (mod.unique) {
    const def = uniqueById(mod.unique);
    if (!def) return "Unknown enchantment";
    const tag = def.rareUnique ? "Rare Unique" : "Unique";
    return `${def.name} (${tag}) — ${def.label(mod.value)}`;
  }
  const shown = PERCENT_STATS.has(mod.stat) ? `${mod.value}%` : mod.value;
  return `+${shown} ${mod.stat}`;
}

// Compact label for a modifier slot cell: a unique shows its name (with a ✦),
// a stat shows its short "+N STAT". The full text rides along as a tooltip.
function formatModifierShort(mod) {
  if (!mod) return "Empty";
  if (mod.unique) {
    const def = uniqueById(mod.unique);
    return def ? `✦ ${def.name}` : "✦ ?";
  }
  const shown = PERCENT_STATS.has(mod.stat) ? `${mod.value}%` : mod.value;
  return `+${shown} ${mod.stat}`;
}
