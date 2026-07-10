// Game state — the single mutable store the whole app reads and writes.
// Systems mutate it and the UI renders from it.
const state = {
  gold: 1000,
  maxAdventurers: BASE_MAX_ADVENTURERS,
  adventurers: [],
  selectedId: null,
  nextId: 1,
  activeTab: "stats", // "stats" | "equipment" | "inventory"
  view: "adventurers", // "adventurers" | "dungeons"
  // Which screen the dungeons view is showing:
  //   "list"   — pick a dungeon
  //   "detail" — a dungeon's page (Enter button + enemy list)
  //   "enemy"  — a single enemy's statline
  //   "battle" — the autobattler playing out
  dungeonScreen: "list",
  selectedDungeonId: null,
  selectedEnemyId: null,
};
