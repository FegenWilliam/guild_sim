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
//     damagePerLevel: 0.1,        // optional: extra damage per skill level above
//                                 //   Lv 1 (0.1 = +10%/level). Omitted → uses
//                                 //   SKILL_DAMAGE_PER_LEVEL. Set 0 for a skill
//                                 //   whose level is purely an unlock gate.
//     effects: [],                // special-effect flags (strings). See below.
//   }
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
// Planned effect *types* the schema is meant to grow into — % max-HP damage,
// buffs, and debuffs — aren't wired into combat yet. When you want a new one,
// add the flag here and ask, and the matching logic gets added to battle.js.
// ============================================================================

// Every skill levels from 1 to this cap.
const SKILL_LEVEL_CAP = 10;

// Default damage growth per skill level above Lv 1 (+10%/level). A skill can
// override this with its own `damagePerLevel` (0 = level is an unlock gate only).
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

// Resolve a skill's MP cost to a concrete number for a caster whose max MP is
// `maxMp`. Percent costs round up so a "10%" skill never rounds down to free.
function skillCost(skill, maxMp) {
  const c = skill.cost;
  if (c.type === "percent") return Math.ceil((maxMp * c.amount) / 100);
  return c.amount;
}

// Damage multiplier for a skill at a given level (1× at Lv 1, growing by the
// skill's per-level rate). Falls back to the module default when unset.
function skillLevelMultiplier(skill, level) {
  const per = skill.damagePerLevel != null ? skill.damagePerLevel : SKILL_DAMAGE_PER_LEVEL;
  return 1 + per * (Math.max(1, level) - 1);
}

// Base damage a skill deals for a caster with the given effective stats at the
// given skill level, before DEF, crit, and evasion. Weighted stat sum × level.
function skillDamage(stats, skill, level) {
  let dmg = 0;
  for (const stat in skill.power) {
    dmg += (stats[stat] || 0) * skill.power[stat];
  }
  return dmg * skillLevelMultiplier(skill, level);
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
