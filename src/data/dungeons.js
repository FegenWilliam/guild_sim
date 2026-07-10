// Dungeons — the main gameplay. You send adventurers in and they run the
// autobattler (see systems/battle.js). A dungeon lists the enemies it contains
// by id (see enemies.js); that enemy list is the main info on a dungeon's page,
// so it's built to grow — add ids to `enemies` and they show up.

const DUNGEONS = [
  {
    id: "high-tower",
    name: "The High Tower",
    recommendation: "Lv 1–50",
    enemies: ["goblin"],
    // A run tops out at 100 waves; clearing them all ends the run (HP kept) and
    // it can be run again from the start.
    maxWaves: 100,
  },
];

function getDungeon(id) {
  return DUNGEONS.find((d) => d.id === id) || null;
}
