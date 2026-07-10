// Skills — the class skill catalog and the small pure helpers that read it.
//
// This is the file you edit to add skills. It's pure data + pure functions: no
// DOM, no mutation of `state`. Learning a skill (the mutation) lives in
// ui/skills.js; using one in a fight lives in systems/battle.js. Both read this.
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
//     requires: null,             // prerequisite skill id, or null. The skill
//                                 //   can't be learned until that one is.
//     cost: { type: "flat", amount: 20 },   // MP spent per use. type is:
//                                 //   "flat"    → `amount` MP, or
//                                 //   "percent" → `amount`% of the caster's max MP
//     maxTargets: 1,              // how many enemies it can hit (1 = single)
//     power: { ATK: 1.5 },        // damage = sum of (stat * multiplier). Keys are
//                                 //   any stat name (STR/DEX/INT/ATK/MATK/...):
//                                 //   { ATK: 1.5 }          → 1.5 × ATK
//                                 //   { DEX: 2, ATK: 0.5 }  → 2 × DEX + 0.5 × ATK
//                                 //   { INT: 2, MATK: 1 }   → 2 × INT + 1 × MATK
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

const SKILLS = {
  // --- Warrior ---
  sweep: {
    id: "sweep",
    name: "Sweep",
    class: "Warrior",
    description: "A wide arc — 1.5× ATK damage to up to 3 enemies.",
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

// Resolve a skill's MP cost to a concrete number for a caster whose max MP is
// `maxMp`. Percent costs round up so a "10%" skill never rounds down to free.
function skillCost(skill, maxMp) {
  const c = skill.cost;
  if (c.type === "percent") return Math.ceil((maxMp * c.amount) / 100);
  return c.amount;
}

// Base damage a skill deals for a caster with the given effective stats, before
// DEF, crit, and evasion are applied. Just the weighted sum of `power`.
function skillDamage(stats, skill) {
  let dmg = 0;
  for (const stat in skill.power) {
    dmg += (stats[stat] || 0) * skill.power[stat];
  }
  return dmg;
}

// Does this skill bypass the target's DEF? (The one effect wired up so far.)
function skillIgnoresDef(skill) {
  return skill.effects.includes("ignoreDef");
}

// --- Learning predicates (pure; the mutation is learnSkill in ui/skills.js) ---

// Has this adventurer already learned the skill?
function hasLearned(adventurer, skillId) {
  return (adventurer.skills || []).includes(skillId);
}

// Is the skill's prerequisite satisfied? (No prereq → always true.)
function prereqMet(adventurer, skill) {
  return !skill.requires || hasLearned(adventurer, skill.requires);
}

// Can this adventurer learn the skill right now? It must be for their class,
// not already learned, and have its prerequisite met.
function canLearnSkill(adventurer, skill) {
  return (
    skill.class === adventurer.className &&
    !hasLearned(adventurer, skill.id) &&
    prereqMet(adventurer, skill)
  );
}
