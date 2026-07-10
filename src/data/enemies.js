// Enemies — the bestiary, keyed by id. Dungeons reference these ids (see
// dungeons.js).
//
// To add an enemy, copy this template into ENEMIES and fill it in:
//
//   myEnemy: {
//     id: "myEnemy",            // must match the key
//     name: "My Enemy",
//     stats: { HP: 0, MP: 0, ATK: 0, DEF: 0, CRIT: 0, "CRIT DMG": 100, EVA: 0 },
//     spawn: { 2: 35, 3: 20, 4: 10, 5: 5 },  // optional, see below
//     loot: [                   // optional, see below
//       { name: "Trophy", chance: 20, price: 5 },
//     ],
//   },
//
// Then list its id on a dungeon (see dungeons.js). Entering a dungeon always
// rolls a pack: each listed enemy shows up 1–5 times.
//
// `loot` is a drop table: each entry is one item that *may* fall when this enemy
// is killed. `chance` is an independent percent roll per kill (so two 20% items
// each drop ~1 in 5 kills, independently), and `price` is what it sells for.
// Drops land in a party member's inventory (see systems/battle.js). Omit `loot`
// for an enemy that drops nothing.
//
// `spawn` is a HIDDEN stat (never shown to the player): the percent chance
// this enemy appears as a group of 2 / 3 / 4 / 5 at once. Leftover percentage
// is the chance of a lone one; keys you omit are 0%. Omit `spawn` entirely for
// an enemy that always appears alone.

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
    // Goblins travel in packs.
    spawn: { 2: 35, 3: 20, 4: 10, 5: 5 },
    // Each has a 1-in-5 shot at dropping either trophy on death.
    loot: [
      { name: "Rusty Sword", chance: 20, price: 8 },
      { name: "Goblin Skin", chance: 20, price: 5 },
    ],
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

// Roll an enemy's loot table on death: each entry drops independently on its own
// percent chance. Returns the list of loot definitions that dropped (possibly
// empty). Pass the enemy's `loot` array; a missing/empty table drops nothing.
function rollLoot(loot) {
  const drops = [];
  for (const entry of loot || []) {
    if (Math.random() * 100 < entry.chance) drops.push(entry);
  }
  return drops;
}

// Roll how many of this enemy spawn at once (1–5), using its hidden `spawn`
// chances. Higher counts are checked first, so each configured percent is the
// literal chance of that group size; anything left over spawns a lone enemy.
function rollSpawnCount(enemy) {
  const chances = enemy.spawn || {};
  const r = Math.random() * 100;
  let cumulative = 0;
  for (let n = 5; n >= 2; n--) {
    cumulative += chances[n] || 0;
    if (r < cumulative) return n;
  }
  return 1;
}
