// Classes — each class defines two things:
//   - perLevel: a fixed allocation of primary stats gained each level. A
//     level-N adventurer has `perLevel[stat] * N` of each primary.
//   - base: overrides to DEFAULT_BASE (see stats.js), so each class opens with
//     its own derived statline before any primaries are applied.
const CLASS_NAMES = ["Warrior", "Ranger", "Mage"];

// Starting primaries: everyone opens with STARTING_PRIMARY in each, except
// their class's `main` stat, which starts at STARTING_MAIN.
const STARTING_PRIMARY = 2;
const STARTING_MAIN = 5;

const CLASSES = {
  Warrior: {
    main: "STR",
    perLevel: { STR: 3, INT: 1, DEX: 1 },
    base: { HP: 100, DEF: 10 },
  },
  Ranger: {
    main: "DEX",
    perLevel: { DEX: 3, INT: 1, STR: 1 },
    base: { CRIT: 3, EVA: 2 },
  },
  Mage: {
    main: "INT",
    perLevel: { INT: 3, DEX: 1, STR: 1 },
    base: { MP: 100, ATK: 4, MATK: 10 },
  },
};

// Resolved base derived stats for a class: defaults with its overrides applied.
function classBase(className) {
  return { ...DEFAULT_BASE, ...CLASSES[className].base };
}
