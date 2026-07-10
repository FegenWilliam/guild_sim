// Stats — the stat vocabulary and how values are displayed.
// Primary stats (STR / DEX / INT) are the drivers. A class grants a fixed
// amount of each primary per level (see classes.js). Every derived stat is
// computed from the primaries, so the whole statsheet moves when you level.
const PRIMARY_STATS = ["STR", "DEX", "INT"];

// Base derived stats — what an adventurer has with zero primaries. Each class
// starts from these defaults and overrides a few of them (see CLASSES.base).
const DEFAULT_BASE = {
  HP: 50,
  MP: 25,
  ATK: 10,
  MATK: 4,
  DEF: 5,
  CRIT: 1,         // %
  "CRIT DMG": 120, // %
  EVA: 0,          // %
};

// Display order for the statsheet: primaries first, then derived.
const DISPLAY_ORDER = [
  "STR", "DEX", "INT",
  "HP", "MP", "ATK", "MATK", "DEF", "CRIT", "CRIT DMG", "EVA",
];

// Stats shown as percentages get a trailing "%" in the stat sheet.
const PERCENT_STATS = new Set(["CRIT", "CRIT DMG", "EVA"]);

// Format a stat value for display: percentages get a trimmed "%", everything
// else prints as-is. Trims to at most 2 decimals, dropping trailing zeros
// (e.g. 5.15, 3.5, 5).
function formatValue(label, value) {
  if (PERCENT_STATS.has(label)) {
    return `${Number(value.toFixed(2))}%`;
  }
  return value;
}

// XP required to advance from `level` to `level + 1`.
function xpToNext(level) {
  return level * 100;
}
