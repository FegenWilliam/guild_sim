// Adventurer — the adventurer model and its derived stats.
// Pure-ish logic: builds adventurers, computes their effective statline from
// class + level + gear, and handles XP/leveling. No DOM here.

function createAdventurer(className) {
  const adventurer = {
    id: state.nextId++,
    name: "Adventurer",
    className,
    level: 1,
    xp: 0,
    // Current HP persists between dungeon runs and only refills when the day is
    // passed. A newbie starts at full.
    hp: 0,
    equipment: createEquipment(),
    inventory: [], // items indexed by slot; empty for now
  };
  adventurer.hp = maxHp(adventurer);
  return adventurer;
}

// An adventurer's maximum HP — the HP from their effective statline.
function maxHp(adventurer) {
  return effectiveStats(adventurer).HP;
}

// An adventurer's current HP, clamped to [0, max]. Falls back to full for older
// saves that predate persistent HP.
function currentHp(adventurer) {
  const max = maxHp(adventurer);
  if (typeof adventurer.hp !== "number") return max;
  return Math.max(0, Math.min(adventurer.hp, max));
}

function getSelected() {
  return state.adventurers.find((a) => a.id === state.selectedId) || null;
}

function displayName(adventurer) {
  return adventurer.name.trim() || "Adventurer";
}

// Primary stat totals: the class's starting allocation plus its per-level
// gains for every level past the first.
function primaryStats(adventurer) {
  const cls = CLASSES[adventurer.className];
  const result = {};
  for (const stat of PRIMARY_STATS) {
    const start = stat === cls.main ? STARTING_MAIN : STARTING_PRIMARY;
    result[stat] = start + (cls.perLevel[stat] || 0) * (adventurer.level - 1);
  }
  return result;
}

// Full statsheet: primaries plus every derived stat computed from them.
//
//   STR = +5 Max HP, +2 DEF, +4 ATK          | every 5: +5% CRIT DMG
//   DEX = +4 DEF, +10 Max MP, +0.05% CRIT    | every 5: +0.5% EVA
//   INT = +25 Max MP, +4 MATK, +1 ATK        | every 5: +2% Max MP (additive)
function effectiveStats(adventurer) {
  const bonuses = equipmentBonuses(adventurer);
  const b = classBase(adventurer.className);

  // Gear primary bonuses (STR/DEX/INT) fold into the primaries *before* derived
  // stats are computed, so e.g. a weapon's +2 STR raises HP/ATK/DEF/CRIT DMG
  // exactly like any other STR would.
  const base = primaryStats(adventurer);
  const p = {};
  for (const stat of PRIMARY_STATS) {
    p[stat] = base[stat] + (bonuses[stat] || 0);
  }

  let hp = b.HP + p.STR * 5;
  let mp = b.MP + p.DEX * 10 + p.INT * 25;
  const atk = b.ATK + p.STR * 4 + p.INT * 1;
  const matk = b.MATK + p.INT * 4;
  const def = b.DEF + p.STR * 2 + p.DEX * 4;
  const crit = b.CRIT + p.DEX * 0.05;
  const critDmg = b["CRIT DMG"] + Math.floor(p.STR / 5) * 5;
  const eva = b.EVA + Math.floor(p.DEX / 5) * 0.5;

  // INT grants +2% Max MP per 5 points, additive, applied to the MP pool.
  const mpPercent = Math.floor(p.INT / 5) * 2;
  mp = Math.round(mp * (1 + mpPercent / 100));

  const result = {
    STR: p.STR,
    DEX: p.DEX,
    INT: p.INT,
    HP: hp,
    MP: mp,
    ATK: atk,
    MATK: matk,
    DEF: def,
    CRIT: crit,
    "CRIT DMG": critDmg,
    EVA: eva,
  };

  // Gear bonuses to derived stats (ATK, CRIT, DEF, ...) add flat on top. The
  // primaries are already baked into `p` above, so they're skipped here — this
  // is what lets a weapon grant +2 STR and +10 ATK and have both land: the STR
  // cascades through the formulas, the ATK stacks on the result.
  for (const stat in bonuses) {
    if (PRIMARY_STATS.includes(stat)) continue;
    if (stat in result) result[stat] += bonuses[stat];
  }

  return result;
}

// Grant XP and level up as thresholds are crossed. No XP source is wired up
// yet — leveling will come later — but the mechanics are ready.
function gainXP(adventurer, amount) {
  adventurer.xp += amount;
  while (adventurer.xp >= xpToNext(adventurer.level)) {
    adventurer.xp -= xpToNext(adventurer.level);
    adventurer.level += 1;
  }
}
