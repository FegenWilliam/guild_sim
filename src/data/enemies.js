// Enemies — the bestiary, keyed by id. Dungeons reference these ids (see
// dungeons.js). Add an entry here and list its id on a dungeon to use it.

// Order enemy stats are displayed and copied in.
const ENEMY_STAT_ORDER = ["HP", "MP", "ATK", "DEF", "CRIT", "CRIT DMG", "EVA"];

const ENEMIES = {
  goblin: {
    id: "goblin",
    name: "Goblin",
    stats: {
      HP: 50,
      MP: 10,
      ATK: 10,
      DEF: 5,
      CRIT: 0,          // %
      "CRIT DMG": 110,  // %
      EVA: 0,           // %
    },
  },
};
