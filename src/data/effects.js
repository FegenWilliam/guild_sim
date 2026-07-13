// Effects — the shared "game mechanics" pool.
//
// This is the single vocabulary of reusable combat EFFECTS. Anything that wants
// to change how a fight resolves — an enemy mod, an enemy skill, a future
// enchantment — describes itself by picking one or more effects from here and
// giving each a magnitude. Combat (systems/battle.js) then applies them
// uniformly, so a new mod/skill is pure data: no new battle code as long as it
// reuses an effect kind that already exists.
//
// An "effect" is a plain object tagged by `kind`; the extra fields it carries
// depend on the kind. The kinds understood today:
//
//   { kind: "damageTakenMult", mult: 0.8 }
//       Scales the damage this combatant TAKES from attacks (0.8 = −20%).
//       Multiple stack multiplicatively. (Hard Skin.)
//
//   { kind: "damageDealtMult", mult: 1.5 }
//       Scales the damage this combatant DEALS with attacks/skills (1.5 = +50%).
//
//   { kind: "extraActions", actions: 1 }
//       Extra turns this combatant takes each round (1 = acts twice). (Agile.)
//
//   { kind: "ignoreDef" }
//       This combatant's attacks skip the target's DEF entirely — the same flag
//       player skills use (see data/skills.js effects: ["ignoreDef"]).
//
//   { kind: "dot", key: "poison", percent: 30, turns: 3, label: "is poisoned for" }
//       Applies a damage-over-time on hit, routed through the standalone DOT
//       system (systems/dot.js) — the same mechanic weapons and the Blazing
//       enchantment use. See dot.js for the field meanings.
//
// To add a brand-new *kind* of effect, add a case here in `resolveEffects` and
// the matching hook in systems/battle.js. To add a new mod or skill that reuses
// an existing kind, you don't touch this file at all — just reference the kind.
//
// NOTE: the enchantment "uniques" (data/enchantments.js) are an older, parallel
// set of bespoke combat hooks that predate this pool. New content should build
// on the effects here; uniques can migrate onto this pool over time.

// Collapse a list of effect descriptors into a single resolved bundle combat can
// read cheaply each hit/turn. Unknown kinds are ignored, so half-written data
// never throws mid-fight. `dotSourceFrom` (systems/dot.js) is only called at
// resolve time, which happens once a battle starts — well after every script
// has loaded — so the load-order dependency is fine.
function resolveEffects(effectList) {
  const out = {
    damageTakenMult: 1, // multiplier on incoming attack damage
    damageDealtMult: 1, // multiplier on outgoing attack/skill damage
    extraActions: 0,    // additional turns per round
    ignoreDef: false,   // attacks bypass DEF
    dots: [],           // DOT sources applied on hit (systems/dot.js)
  };
  for (const e of effectList || []) {
    if (!e) continue;
    switch (e.kind) {
      case "damageTakenMult":
        out.damageTakenMult *= e.mult != null ? e.mult : 1;
        break;
      case "damageDealtMult":
        out.damageDealtMult *= e.mult != null ? e.mult : 1;
        break;
      case "extraActions":
        out.extraActions += e.actions || 0;
        break;
      case "ignoreDef":
        out.ignoreDef = true;
        break;
      case "dot":
        out.dots.push(dotSourceFrom(e));
        break;
      // Unknown kind → silently skipped.
    }
  }
  return out;
}

// The identity bundle: what a combatant with no effects resolves to. Handy so
// combat can treat "no effects" and "resolved effects" the same shape.
const NO_EFFECTS = {
  damageTakenMult: 1,
  damageDealtMult: 1,
  extraActions: 0,
  ignoreDef: false,
  dots: [],
};
