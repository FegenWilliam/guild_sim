// Game state — the single mutable store the whole app reads and writes.
// Systems mutate it and the UI renders from it.
const state = {
  gold: 1000,
  // The current day. Passing the day heals the whole party to full — the main
  // brake on running dungeons back to back (see systems/day.js).
  day: 1,
  maxAdventurers: BASE_MAX_ADVENTURERS,
  adventurers: [],
  selectedId: null,
  nextId: 1,
  activeTab: "stats", // "stats" | "equipment" | "inventory" | "skills"
  view: "adventurers", // "adventurers" | "dungeons" | "town"
  // Which screen the dungeons view is showing:
  //   "list"   — pick a dungeon
  //   "detail" — a dungeon's page (Enter button + enemy list)
  //   "enemy"  — a single enemy's statline
  //   "battle" — the autobattler playing out
  dungeonScreen: "list",
  selectedDungeonId: null,
  selectedEnemyId: null,
  // Town view: which service is open, and where the Equipment Shop is (its grid
  // of stock vs. a single item's detail page). All transient — never saved.
  townService: "shop", // only the Equipment Shop exists so far
  shopScreen: "grid", // "grid" | "detail"
  shopItemId: null,
};
