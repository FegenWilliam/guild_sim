// Enemy mods — the catalog of modifiers that make an enemy harder, keyed by id.
//
// A mod is a *named bundle of effects* drawn from the shared effects pool
// (data/effects.js). It's the enemy-side analogue of an enchantment: the mod
// gives it a name + description for the UI, and the effects it lists are what
// combat actually applies. Because mods lean on the shared pool, adding one is
// usually pure data — no battle code — as long as the effect kinds it uses
// already exist (see data/effects.js for the kinds and how to add a new one).
//
// An enemy is given mods by listing their ids on its definition (enemies.js
// `mods: [...]`). An enemy can carry several; their effects are all resolved
// together (see gatherModEffects).
//
// ============================================================================
// How to add an enemy mod
// ============================================================================
//   myMod: {
//     id: "myMod",                // must match the key
//     name: "My Mod",             // shown in the bestiary and on battle cards
//     description: "...",         // one line explaining what it does
//     effects: [                  // effect descriptors from data/effects.js
//       { kind: "damageTakenMult", mult: 0.8 },
//     ],
//   }
//
// Then list its id on an enemy (see enemies.js). That's it.

const ENEMY_MODS = {
  // Tough hide — attacks land for less.
  hardSkin: {
    id: "hardSkin",
    name: "Hard Skin",
    description: "Takes 20% less damage from attacks.",
    effects: [{ kind: "damageTakenMult", mult: 0.8 }],
  },

  // Quick on its feet — gets a second action every turn.
  agile: {
    id: "agile",
    name: "Agile",
    description: "Acts twice per turn.",
    effects: [{ kind: "extraActions", actions: 1 }],
  },

  // A couple more to show the pool composes freely:

  // Hits harder across the board.
  berserk: {
    id: "berserk",
    name: "Berserk",
    description: "Deals 50% more damage.",
    effects: [{ kind: "damageDealtMult", mult: 1.5 }],
  },

  // A poisonous bite — every hit leaves a DOT (reuses the DOT system).
  venomous: {
    id: "venomous",
    name: "Venomous",
    description: "Its hits poison for 25% of the damage over 3 turns.",
    effects: [{ kind: "dot", key: "poison", percent: 25, turns: 3, label: "is poisoned for" }],
  },

  // The next three lean on unique-enchantment mechanics re-expressed as effects
  // (see data/effects.js), so a mod can grant them without any enchantment code.

  // Drains HP from what it hits — the Vampiric mechanic.
  vampiric: {
    id: "vampiric",
    name: "Vampiric",
    description: "Heals for 25% of the damage it deals.",
    effects: [{ kind: "lifesteal", percent: 25 }],
  },

  // A swollen health pool — the Andragolas mechanic.
  giant: {
    id: "giant",
    name: "Giant",
    description: "Has 50% more max HP.",
    effects: [{ kind: "maxHpMult", mult: 1.5 }],
  },

  // Shrugs off a killing blow once — the Last Stand mechanic.
  undying: {
    id: "undying",
    name: "Undying",
    description: "Survives one lethal hit, holding at 25% HP.",
    effects: [{ kind: "lastStand", percent: 25 }],
  },
};

// Look up an enemy mod by id (undefined for an unknown id).
function enemyModById(id) {
  return ENEMY_MODS[id];
}

// The display names of the mods listed on an enemy definition, in order (unknown
// ids dropped). Used by the bestiary and battle cards to tag a modded enemy.
function enemyModNames(enemy) {
  return (enemy.mods || [])
    .map((id) => enemyModById(id))
    .filter(Boolean)
    .map((m) => m.name);
}

// Resolve every effect from every mod on an enemy into one combined bundle (see
// data/effects.js resolveEffects). This is what an enemy combatant carries into
// the fight, mirroring how a party member carries its gathered uniques.
function gatherModEffects(enemy) {
  const list = [];
  for (const id of enemy.mods || []) {
    const mod = enemyModById(id);
    if (mod) for (const e of mod.effects || []) list.push(e);
  }
  return resolveEffects(list);
}
