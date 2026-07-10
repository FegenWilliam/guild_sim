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

// Roll one stone of `tierId` into a concrete modifier: pick a random stat, roll
// a percent inside the tier's band, and scale the stat's max by it. Returns a
// flat modifier descriptor { stat, value, tier } ready to drop into a slot, or
// null if the tier id is unknown.
function rollEnchantment(tierId) {
  const tier = enchantTierById(tierId);
  if (!tier) return null;

  const stat = ENCHANT_STATS[Math.floor(Math.random() * ENCHANT_STATS.length)];
  const [lo, hi] = tier.band;
  const percent = lo + Math.random() * (hi - lo);
  const value = roundEnchantValue(stat, (percent / 100) * ENCHANT_STAT_MAX[stat]);
  return { stat, value, tier: tierId };
}

// Human-readable text for one rolled modifier, e.g. "+40 ATK" or "+12.5% CRIT".
// Mirrors formatBonus/formatValue so enchantments read like every other stat.
function formatModifier(mod) {
  if (!mod) return "Empty";
  const shown = PERCENT_STATS.has(mod.stat) ? `${mod.value}%` : mod.value;
  return `+${shown} ${mod.stat}`;
}
