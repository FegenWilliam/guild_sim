// Enemy skills — the catalog of skills enemies can use, keyed by id. Separate
// from the player skill catalog (data/skills.js): enemy skills are simpler
// (enemies don't level them and there's no unlock/skill-point economy) and they
// aim at the *party*.
//
// An enemy is assigned skills by listing their ids on its definition (see
// enemies.js `skills: [...]`). Each turn the battle picks the first skill it's
// carrying that is both affordable AND off cooldown, else it swings a basic
// attack. Using a skill spends the enemy's MP (the MP stat finally does
// something) and starts its cooldown, so a big skill can't fire every turn even
// when the enemy has the MP to spare.
//
// ============================================================================
// How to add an enemy skill
// ============================================================================
// Add one entry to ENEMY_SKILLS keyed by a unique id:
//
//   myskill: {
//     id: "myskill",              // must match the key
//     name: "My Skill",           // shown in the battle log and the bestiary
//     description: "...",         // one line shown on the enemy page
//     cost: 10,                   // MP spent per use (0 = free)
//     cooldown: 3,                // turns before it can be used again after a
//                                 //   cast (counted in the enemy's own turns;
//                                 //   0/omitted = usable every turn if affordable)
//     power: { ATK: 2 },          // damage = sum of (stat × multiplier), read
//                                 //   off the enemy's statline. Keys are stat
//                                 //   names (ATK/MATK/DEF/…): { ATK: 2 } → 2×ATK,
//                                 //   { ATK: 3, MATK: 2 } → 3×ATK + 2×MATK.
//     maxTargets: 1,              // how many party members it hits (default 1)…
//     allTargets: false,          // …or set true to hit the WHOLE party at once
//                                 //   (overrides maxTargets).
//     effects: [],                // effect flags from the shared pool that change
//                                 //   resolution. Only "ignoreDef" is read on the
//                                 //   skill path today (bypasses the target's DEF).
//   }
//
// Then list its id on an enemy (see enemies.js). That's it — no battle code.

const ENEMY_SKILLS = {
  // Hurls its weapon for a heavy single-target hit.
  throwWeapon: {
    id: "throwWeapon",
    name: "Throw Weapon",
    description: "Hurls a weapon — 2× ATK damage to one target.",
    cost: 8,
    cooldown: 2,
    power: { ATK: 2 },
    maxTargets: 1,
    effects: [],
  },

  // A sweeping breath that scorches the entire party at once.
  fireBreath: {
    id: "fireBreath",
    name: "Fire Breath",
    description: "Scorches the whole party — 3× ATK + 2× MATK to everyone.",
    cost: 20,
    cooldown: 3,
    power: { ATK: 3, MATK: 2 },
    allTargets: true,
    effects: [],
  },
};

// Look up an enemy skill by id (undefined for an unknown id).
function enemySkillById(id) {
  return ENEMY_SKILLS[id];
}

// The base damage a skill deals, before DEF/crit/evasion: the weighted sum of
// the caster's stats. `stats` is an enemy's statline ({ ATK, MATK, ... }); a
// stat the skill scales that the enemy lacks counts as 0.
function enemySkillDamage(stats, skill) {
  let dmg = 0;
  for (const stat in skill.power) {
    dmg += (stats[stat] || 0) * skill.power[stat];
  }
  return dmg;
}

// The party members a skill hits this turn, chosen from the still-active foes:
// the whole list for an `allTargets` skill, otherwise the first `maxTargets` of
// them (enemies don't play favorites — they take them in order).
function enemySkillTargets(skill, activeFoes) {
  if (skill.allTargets) return activeFoes;
  return activeFoes.slice(0, skill.maxTargets || 1);
}

// Does this enemy skill bypass the target's DEF? (The one effect flag the skill
// path reads, shared with player skills.)
function enemySkillIgnoresDef(skill) {
  return (skill.effects || []).includes("ignoreDef");
}

// A compact "cost & cadence" line for the bestiary/clipboard, e.g.
// "8 MP · 2-turn cooldown" or just "20 MP" when there's no cooldown.
function enemySkillMeta(skill) {
  const parts = [`${skill.cost || 0} MP`];
  if (skill.cooldown) parts.push(`${skill.cooldown}-turn cooldown`);
  return parts.join(" · ");
}
