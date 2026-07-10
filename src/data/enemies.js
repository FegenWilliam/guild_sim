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

// The XP an enemy is worth, derived entirely from its statline:
//   HP, MP  → 0.05 each
//   ATK     → 0.2 each
//   DEF     → 0.1 each
//   CRIT    → 1 per whole percent (anything below 1% doesn't count)
//   CRIT DMG→ 0.5 for every full 5% above 100%
//   EVA     → 2 per percent
// (e.g. the Goblin is worth 6.5 XP.)
function enemyXP(enemy) {
  const s = enemy.stats;
  let xp = 0;
  xp += s.HP * 0.05;
  xp += s.MP * 0.05;
  xp += s.ATK * 0.2;
  xp += s.DEF * 0.1;
  xp += Math.floor(s.CRIT) * 1;
  xp += Math.floor(Math.max(0, s["CRIT DMG"] - 100) / 5) * 0.5;
  xp += s.EVA * 2;
  return xp;
}
