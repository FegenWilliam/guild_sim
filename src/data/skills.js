// Skills — the class skill catalog and the small pure helpers that read it.
//
// This is the file you edit to add skills. It's pure data + pure functions: no
// DOM, no mutation of `state`. Learning/leveling a skill (the mutation) lives in
// ui/skills.js; using one in a fight lives in systems/battle.js. Both read this.
//
// Every adventurer owns a set of skills as a { skillId: level } map. A skill is
// "learned" once it's in the map; its value is its level (1–SKILL_LEVEL_CAP).
// Each class opens with its starter skill at Lv 1 (the one flagged `starter`).
// Skill points (earned +1 per character level) are spent to unlock a new skill
// or level up one already learned.
//
// ============================================================================
// How to add a skill
// ============================================================================
// Add one entry to SKILLS keyed by a unique id. The shape:
//
//   myskill: {
//     id: "myskill",             // must match the key
//     name: "My Skill",          // shown in the UI and the battle log
//     class: "Warrior",          // which class can learn it (see CLASS_NAMES)
//     description: "...",         // one line shown on the skill card
//     starter: false,             // true = granted free at Lv 1 on creation.
//                                 //   Exactly one starter per class.
//     requires: null,             // unlock gate — one of:
//                                 //   null                        → no gate
//                                 //   { skill: "sweep" }          → Sweep learned
//                                 //   { skill: "sweep", level: 5 }→ Sweep at Lv 5+
//     cost: { type: "flat", amount: 20 },   // MP spent per use. type is:
//                                 //   "flat"    → `amount` MP, or
//                                 //   "percent" → `amount`% of the caster's max MP
//     maxTargets: 1,              // how many enemies it can hit (1 = single).
//                                 //   The battle AI only fires a multi-target
//                                 //   skill (>=2) when 2+ enemies are up, or when
//                                 //   the hit would finish a lone enemy.
//     power: { ATK: 1.5 },        // damage = sum of (stat * multiplier). Keys are
//                                 //   any stat name (STR/DEX/INT/ATK/MATK/...):
//                                 //   { ATK: 1.5 }          → 1.5 × ATK
//                                 //   { DEX: 2, ATK: 0.5 }  → 2 × DEX + 0.5 × ATK
//                                 //   { INT: 2, MATK: 1 }   → 2 × INT + 1 × MATK
//     repeat: 0,                  // base extra casts per use (see Repeat below).
//                                 //   Usually 0 and granted by a level instead.
//     effects: [],                // special-effect flags (strings). See below.
//
//     // --- Per-level scaling -------------------------------------------------
//     damagePerLevel: 0.1,        // the "default fill": what a level with no
//                                 //   explicit entry grants (0.1 = +10% damage).
//                                 //   Omitted → SKILL_DAMAGE_PER_LEVEL.
//     levelUps: [ ... ],          // optional. Entry i is the bonus gained on
//                                 //   reaching level i+2 (so [0] = Lv 2's gain,
//                                 //   [8] = Lv 10's). A missing entry falls back
//                                 //   to the default fill; an entry REPLACES it,
//                                 //   so combine effects in one object if you
//                                 //   want both. Each entry may set any of:
//                                 //     damagePct: 0.15   → +15% damage
//                                 //     damageFlat: 10    → +10 flat damage
//                                 //     costPct: 0.10     → -10% MP cost
//                                 //     costFlat: 5       → -5 flat MP cost
//                                 //     targets: 1        → +1 max targets
//                                 //     power: { DEX: 0.5 } → +0.5 to DEX's mult
//                                 //     repeat: 1         → +1 extra cast
//   }
//
// (For a skill whose level is a pure unlock gate with no power growth, set
//  `damagePerLevel: 0` and give it no `levelUps`.)
//
// ----------------------------------------------------------------------------
// Special effects
// ----------------------------------------------------------------------------
// `effects` is an open list of flags that change how a skill resolves. The data
// here just names them; the actual behavior is wired up in systems/battle.js.
// Currently implemented:
//
//   "ignoreDef" — the hit skips the target's DEF reduction entirely (like a
//                 Mage's magic). Magic Bolt uses this.
//
// Repeat is not a flag but a number (`repeat`, grown by `levelUps`): after a
// skill resolves it fires again that many extra times, re-aiming each time. One
// MP payment covers the whole thing.
//
// Planned effect *types* the schema is meant to grow into — % max-HP damage,
// buffs, and debuffs — aren't wired into combat yet. When you want a new one,
// add the flag here and ask, and the matching logic gets added to battle.js.
// ============================================================================

// Every skill levels from 1 to this cap.
const SKILL_LEVEL_CAP = 10;

// Default damage growth for a level with no explicit `levelUps` entry
// (+10%/level). A skill can override this with its own `damagePerLevel`.
const SKILL_DAMAGE_PER_LEVEL = 0.1;

const SKILLS = {
  // --- Warrior ---
  sweep: {
    id: "sweep",
    name: "Sweep",
    class: "Warrior",
    description: "A wide arc — 1.5× ATK damage to up to 3 enemies.",
    starter: true,
    requires: null,
    cost: { type: "flat", amount: 20 },
    maxTargets: 3,
    power: { ATK: 1.5 },
    effects: [],
    // Grows wider and harder-hitting, then finishes with a second swing.
    levelUps: [
      { damagePct: 0.1 },        // Lv 2  +10% damage
      { damagePct: 0.1 },        // Lv 3  +10% damage
      { power: { ATK: 0.25 } },  // Lv 4  ATK scaling 1.5 → 1.75
      { targets: 1 },            // Lv 5  now hits 4
      { damagePct: 0.15 },       // Lv 6  +15% damage
      { costFlat: 4 },           // Lv 7  cost 20 → 16 MP
      { targets: 1 },            // Lv 8  now hits 5
      { damagePct: 0.2 },        // Lv 9  +20% damage
      { repeat: 1 },             // Lv 10 sweeps twice per use
    ],
  },

  // --- Ranger ---
  powerShot: {
    id: "powerShot",
    name: "Power Shot",
    class: "Ranger",
    description: "A charged arrow — 2× DEX + 0.5× ATK to a single enemy.",
    starter: true,
    requires: null,
    cost: { type: "flat", amount: 15 },
    maxTargets: 1,
    power: { DEX: 2, ATK: 0.5 },
    effects: [],
    // Sharpens its DEX scaling and gets cheaper, then double-fires.
    levelUps: [
      { damagePct: 0.1 },        // Lv 2  +10% damage
      { power: { DEX: 0.5 } },   // Lv 3  DEX scaling 2 → 2.5
      { damagePct: 0.1 },        // Lv 4  +10% damage
      { costPct: 0.1 },          // Lv 5  -10% MP cost
      { power: { DEX: 0.5 } },   // Lv 6  DEX scaling → 3
      { damageFlat: 15 },        // Lv 7  +15 flat damage
      { damagePct: 0.15 },       // Lv 8  +15% damage
      { costPct: 0.2 },          // Lv 9  -20% more MP cost
      { repeat: 1 },             // Lv 10 fires a second arrow
    ],
  },

  // --- Mage ---
  magicBolt: {
    id: "magicBolt",
    name: "Magic Bolt",
    class: "Mage",
    description: "A piercing bolt — 2× INT + MATK to a single enemy. Ignores DEF.",
    starter: true,
    requires: null,
    cost: { type: "flat", amount: 25 },
    maxTargets: 1,
    power: { INT: 2, MATK: 1 },
    effects: ["ignoreDef"],
    // Scales its INT/MATK, learns to double-cast, then splits to a 2nd target.
    levelUps: [
      { damagePct: 0.1 },        // Lv 2  +10% damage
      { damagePct: 0.1 },        // Lv 3  +10% damage
      { power: { INT: 0.5 } },   // Lv 4  INT scaling 2 → 2.5
      { costFlat: 5 },           // Lv 5  cost 25 → 20 MP
      { damagePct: 0.15 },       // Lv 6  +15% damage
      { power: { MATK: 0.5 } },  // Lv 7  MATK scaling 1 → 1.5
      { repeat: 1 },             // Lv 8  casts twice per use
      { damagePct: 0.2 },        // Lv 9  +20% damage
      { targets: 1 },            // Lv 10 the bolt forks to 2 enemies
    ],
  },
};

// Definition order, so the UI lists skills in the order they're written above.
const SKILL_ORDER = Object.keys(SKILLS);

// Look up a skill by id (returns undefined for an unknown id).
function skillById(id) {
  return SKILLS[id];
}

// Every skill a class can learn, in definition order.
function skillsForClass(className) {
  return SKILL_ORDER.map((id) => SKILLS[id]).filter((s) => s.class === className);
}

// The starter skill a class is created with (the one flagged `starter`).
function starterSkillForClass(className) {
  return skillsForClass(className).find((s) => s.starter) || null;
}

// Collapse a skill's base stats and its per-level bonuses into the concrete
// parameters it has at `level`. Walks each level-up step 2..level, applying the
// matching `levelUps` entry (or the default damage fill when a step is blank).
// This is the one place scaling lives; damage/cost/targets/repeat all read it.
function effectiveSkill(skill, level) {
  const lvl = Math.max(1, Math.min(level || 1, SKILL_LEVEL_CAP));
  const power = { ...skill.power };
  let extraTargets = 0;
  let damageMult = 1; // 1 + sum of damagePct
  let damageFlat = 0;
  let costPctCut = 0; // fraction of base cost removed
  let costFlatCut = 0; // flat MP removed
  let repeat = skill.repeat || 0;

  // A level with no explicit entry just grants the default damage bump.
  const per = skill.damagePerLevel != null ? skill.damagePerLevel : SKILL_DAMAGE_PER_LEVEL;
  const defaultStep = { damagePct: per };

  for (let L = 2; L <= lvl; L++) {
    const step = (skill.levelUps && skill.levelUps[L - 2]) || defaultStep;
    if (step.damagePct) damageMult += step.damagePct;
    if (step.damageFlat) damageFlat += step.damageFlat;
    if (step.costPct) costPctCut += step.costPct;
    if (step.costFlat) costFlatCut += step.costFlat;
    if (step.targets) extraTargets += step.targets;
    if (step.repeat) repeat += step.repeat;
    if (step.power) {
      for (const s in step.power) power[s] = (power[s] || 0) + step.power[s];
    }
  }

  return {
    power,
    maxTargets: (skill.maxTargets || 1) + extraTargets,
    damageMult,
    damageFlat,
    costPctCut,
    costFlatCut,
    repeat,
  };
}

// Resolve a skill's MP cost for a caster with max MP `maxMp` at `level`, after
// its level's cost reductions. Rounds up so a percent cost never becomes free
// by rounding, and never drops below 0.
function skillCost(skill, maxMp, level) {
  const c = skill.cost;
  let cost = c.type === "percent" ? (maxMp * c.amount) / 100 : c.amount;
  const eff = effectiveSkill(skill, level);
  cost = cost * (1 - eff.costPctCut) - eff.costFlatCut;
  return Math.max(0, Math.ceil(cost));
}

// Base damage a skill deals for a caster with the given effective stats at the
// given skill level, before DEF, crit, and evasion: the (leveled) weighted stat
// sum, scaled by the level's damage multiplier, plus any flat damage.
function skillDamage(stats, skill, level) {
  const eff = effectiveSkill(skill, level);
  let dmg = 0;
  for (const stat in eff.power) {
    dmg += (stats[stat] || 0) * eff.power[stat];
  }
  return dmg * eff.damageMult + eff.damageFlat;
}

// How many enemies the skill hits at `level` (base targets + level bonuses).
function skillMaxTargets(skill, level) {
  return effectiveSkill(skill, level).maxTargets;
}

// How many *extra* times the skill fires after its first cast at `level`.
function skillRepeat(skill, level) {
  return effectiveSkill(skill, level).repeat;
}

// Does this skill bypass the target's DEF? (The one effect wired up so far.)
function skillIgnoresDef(skill) {
  return skill.effects.includes("ignoreDef");
}

// --- Skill-map helpers (adventurer.skills is a { skillId: level } map) --------

// This adventurer's level in a skill, or 0 if it isn't learned.
function skillLevel(adventurer, skillId) {
  return (adventurer.skills && adventurer.skills[skillId]) || 0;
}

// Has this adventurer learned the skill at all (level >= 1)?
function hasLearned(adventurer, skillId) {
  return skillLevel(adventurer, skillId) >= 1;
}

// Is the skill's unlock gate satisfied? A gate names a prerequisite skill and,
// optionally, a minimum level in it (default 1 = merely learned).
function prereqMet(adventurer, skill) {
  if (!skill.requires) return true;
  const need = skill.requires.level || 1;
  return skillLevel(adventurer, skill.requires.skill) >= need;
}

// Human-readable unlock gate, e.g. "Requires Sweep" or "Requires Sweep Lv 5".
function requirementText(skill) {
  if (!skill.requires) return "";
  const req = skillById(skill.requires.skill);
  const name = req ? req.name : skill.requires.skill;
  const lvl = skill.requires.level && skill.requires.level > 1 ? ` Lv ${skill.requires.level}` : "";
  return `Requires ${name}${lvl}`;
}

// Can this adventurer unlock (first-time learn) the skill right now? It must be
// for their class, unlearned, its gate met, and they need a skill point.
function canUnlockSkill(adventurer, skill) {
  return (
    skill.class === adventurer.className &&
    !hasLearned(adventurer, skill.id) &&
    prereqMet(adventurer, skill) &&
    (adventurer.skillPoints || 0) >= 1
  );
}

// Can this adventurer level up an already-learned skill? It must not be capped,
// and they need a skill point.
function canLevelUpSkill(adventurer, skill) {
  return (
    hasLearned(adventurer, skill.id) &&
    skillLevel(adventurer, skill.id) < SKILL_LEVEL_CAP &&
    (adventurer.skillPoints || 0) >= 1
  );
}
