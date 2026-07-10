// Content validation — a load-time sanity check over the pure data files
// (skills, equipment, enemies, dungeons, classes). It changes NO gameplay: it
// only reads the catalogs and prints clear, plain-English warnings to the
// browser console when an entry looks wrong — a misspelled enemy id on a
// dungeon, a skill that scales off a stat that doesn't exist, an equipment slot
// that isn't real, two things sharing an id, and so on.
//
// Why this exists: the whole point of the data files is that you can add lots of
// skills / items / enemies without deep JS knowledge — just append an entry.
// The risk with that is a typo fails *silently* (the enemy never spawns, the
// skill does zero damage) with nothing to tell you why. This turns those silent
// failures into a console message that says exactly what's wrong and where.
//
// It runs itself once at load (see the call at the bottom). Loaded last among
// the data files so every catalog it inspects is already defined. Everything
// here is read-only — safe to delete if you ever want to ship without it.

// The complete stat vocabulary anything can reference: the primaries plus every
// derived stat. A skill `power`, an equipment `bonus`, or a class `base` that
// names a stat outside this set is a typo.
const VALID_STATS = new Set([...PRIMARY_STATS, ...Object.keys(DEFAULT_BASE)]);

// Effect flags the battle engine actually understands today. Others are allowed
// (the schema is meant to grow) but flagged as "not wired up yet" so you know
// the flag won't do anything in a fight until battle.js learns it.
const WIRED_SKILL_EFFECTS = new Set(["ignoreDef"]);

// Every equipment slot id an item may target (bag included).
function validSlotIds() {
  return new Set(EQUIPMENT_SLOTS.map((s) => s.id));
}

// Join a set/array of allowed values into a readable "a, b, c" for a message.
function listOptions(values) {
  return [...values].map((v) => `"${v}"`).join(", ");
}

// Run every check, collecting human-readable problems. Returns the list so the
// caller can decide how loud to be. No throwing — one bad entry never blocks the
// rest of the report.
function collectContentIssues() {
  const issues = [];
  const warn = (msg) => issues.push(msg);

  // --- Skills --------------------------------------------------------------
  const starterCountByClass = {};
  for (const key in SKILLS) {
    const skill = SKILLS[key];
    const where = `Skill "${key}"`;

    if (skill.id !== key) {
      warn(`${where} has id "${skill.id}" — it must match its key "${key}".`);
    }
    if (!CLASS_NAMES.includes(skill.class)) {
      warn(`${where} is for class "${skill.class}", which doesn't exist. Valid: ${listOptions(CLASS_NAMES)}.`);
    }
    if (skill.starter) {
      starterCountByClass[skill.class] = (starterCountByClass[skill.class] || 0) + 1;
    }

    // Cost shape.
    if (!skill.cost || (skill.cost.type !== "flat" && skill.cost.type !== "percent")) {
      warn(`${where} cost.type must be "flat" or "percent" (got ${JSON.stringify(skill.cost)}).`);
    }

    // Damage scaling stats — base power and any per-level power bumps.
    for (const stat in skill.power || {}) {
      if (!VALID_STATS.has(stat)) {
        warn(`${where} scales off unknown stat "${stat}". Valid stats: ${listOptions(VALID_STATS)}.`);
      }
    }
    for (const step of skill.levelUps || []) {
      for (const stat in step.power || {}) {
        if (!VALID_STATS.has(stat)) {
          warn(`${where} has a level-up that scales off unknown stat "${stat}".`);
        }
      }
    }

    // Unlock gate points at a real skill.
    if (skill.requires && !SKILLS[skill.requires.skill]) {
      warn(`${where} requires skill "${skill.requires.skill}", which doesn't exist.`);
    }

    // Effect flags that combat won't act on yet.
    for (const effect of skill.effects || []) {
      if (!WIRED_SKILL_EFFECTS.has(effect)) {
        warn(`${where} uses effect "${effect}", which battle.js doesn't handle yet — it will do nothing in a fight.`);
      }
    }
  }
  // Each class needs exactly one starter (the free Lv 1 skill on creation).
  for (const className of CLASS_NAMES) {
    const count = starterCountByClass[className] || 0;
    if (count !== 1) {
      warn(`Class "${className}" has ${count} starter skills — it needs exactly 1 (a skill flagged \`starter: true\`).`);
    }
  }

  // --- Equipment (shop) ----------------------------------------------------
  const slotIds = validSlotIds();
  const seenEquipIds = new Set();
  for (const def of SHOP_EQUIPMENT) {
    const where = `Equipment "${def.id || def.name}"`;
    if (!def.id) warn(`${where} is missing an id.`);
    if (def.id && seenEquipIds.has(def.id)) warn(`Two shop items share the id "${def.id}" — ids must be unique.`);
    if (def.id) seenEquipIds.add(def.id);

    if (!slotIds.has(def.slot)) {
      warn(`${where} targets slot "${def.slot}", which doesn't exist. Valid slots: ${listOptions(slotIds)}.`);
    }
    if (typeof def.price !== "number") {
      warn(`${where} price should be a number (got ${JSON.stringify(def.price)}).`);
    }
    // Every non-bag item mints via createEquipmentItem, which reads `bonuses`.
    if (def.slot !== BAG_SLOT && !Array.isArray(def.bonuses)) {
      warn(`${where} needs a \`bonuses\` array (use [] for no stat bonuses).`);
    }
    for (const b of def.bonuses || []) {
      if (!VALID_STATS.has(b.stat)) {
        warn(`${where} grants unknown stat "${b.stat}". Valid stats: ${listOptions(VALID_STATS)}.`);
      }
      if (b.perStat && !VALID_STATS.has(b.perStat)) {
        warn(`${where} scales off unknown stat "${b.perStat}".`);
      }
    }
  }

  // --- Enemies -------------------------------------------------------------
  for (const key in ENEMIES) {
    const enemy = ENEMIES[key];
    const where = `Enemy "${key}"`;
    if (enemy.id !== key) {
      warn(`${where} has id "${enemy.id}" — it must match its key "${key}".`);
    }
    for (const stat of ENEMY_STAT_ORDER) {
      if (typeof (enemy.stats || {})[stat] !== "number") {
        warn(`${where} is missing the numeric stat "${stat}".`);
      }
    }
    for (const drop of enemy.loot || []) {
      if (!drop.name || typeof drop.chance !== "number" || typeof drop.price !== "number") {
        warn(`${where} has a loot entry that needs { name, chance, price } (got ${JSON.stringify(drop)}).`);
      }
    }
    for (const n in enemy.spawn || {}) {
      if (Number(n) < 2 || Number(n) > 5) {
        warn(`${where} spawn chance is keyed "${n}" — spawn keys must be 2, 3, 4, or 5 (a lone enemy is the leftover).`);
      }
    }
  }

  // --- Dungeons ------------------------------------------------------------
  const seenDungeonIds = new Set();
  for (const dungeon of DUNGEONS) {
    const where = `Dungeon "${dungeon.id || dungeon.name}"`;
    if (seenDungeonIds.has(dungeon.id)) warn(`Two dungeons share the id "${dungeon.id}" — ids must be unique.`);
    seenDungeonIds.add(dungeon.id);

    if (!Array.isArray(dungeon.enemies) || dungeon.enemies.length === 0) {
      warn(`${where} lists no enemies — add at least one enemy id to its \`enemies\` array.`);
    }
    for (const enemyId of dungeon.enemies || []) {
      if (!ENEMIES[enemyId]) {
        warn(`${where} lists unknown enemy id "${enemyId}". Valid enemy ids: ${listOptions(Object.keys(ENEMIES))}.`);
      }
    }
    if (dungeon.maxWaves != null && typeof dungeon.maxWaves !== "number") {
      warn(`${where} maxWaves should be a number, or omitted for no cap.`);
    }
  }

  // --- Classes -------------------------------------------------------------
  for (const className of CLASS_NAMES) {
    const cls = CLASSES[className];
    if (!cls) {
      warn(`Class "${className}" is in CLASS_NAMES but has no entry in CLASSES.`);
      continue;
    }
    if (!PRIMARY_STATS.includes(cls.main)) {
      warn(`Class "${className}" main stat "${cls.main}" isn't a primary. Valid: ${listOptions(PRIMARY_STATS)}.`);
    }
    for (const stat in cls.perLevel || {}) {
      if (!PRIMARY_STATS.includes(stat)) {
        warn(`Class "${className}" gains "${stat}" per level, but only primaries (${listOptions(PRIMARY_STATS)}) grow per level.`);
      }
    }
    for (const stat in cls.base || {}) {
      if (!VALID_STATS.has(stat)) {
        warn(`Class "${className}" base overrides unknown stat "${stat}".`);
      }
    }
  }

  return issues;
}

// Run the check once at load and report. A clean run logs a quiet one-line
// summary; problems log a grouped, numbered list so they're easy to work
// through. Wrapped so a bug in the validator can never break the game.
function validateContent() {
  try {
    const issues = collectContentIssues();
    if (issues.length === 0) {
      console.info(
        `[Guild Sim] content OK — ${Object.keys(SKILLS).length} skills, ` +
          `${SHOP_EQUIPMENT.length} shop items, ${Object.keys(ENEMIES).length} enemies, ` +
          `${DUNGEONS.length} dungeons, ${CLASS_NAMES.length} classes.`
      );
      return;
    }
    console.warn(`[Guild Sim] content check found ${issues.length} issue(s):`);
    issues.forEach((msg, i) => console.warn(`  ${i + 1}. ${msg}`));
  } catch (err) {
    console.warn("[Guild Sim] content check couldn't run:", err);
  }
}

validateContent();
