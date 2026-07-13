// Damage-over-time — a standalone combat system, independent of any one source.
//
// A DOT is a burn/poison/bleed that ticks at the start of a victim's turn. This
// file owns the whole mechanic; the things that *cause* DOT (the Blazing
// enchantment, a weapon that innately applies one, an enemy's attack later) just
// describe a "DOT source" and hand it here. Nothing about enchantments lives in
// this file — Blazing is only one of several possible sources.
//
// A combatant carries:
//   dots        — active DOTs keyed by type, e.g. { poison: { dmg, turns, label } }
//   dotSources  — the DOTs this combatant *inflicts* on hit (from gear/effects)
//
// DOTs are keyed by type so different flavors stack (a poison and a burn tick
// side by side), while two of the same type follow "strongest wins": a bigger
// application replaces and refreshes the weaker one, a smaller one is ignored —
// the rule the Blazing enchantment is specified with.

// Normalize a raw DOT spec (from an item or enemy definition, or an effect) into
// a source: { key, percent, turns, label }. `percent` is the share of the hit's
// damage that becomes the per-turn tick; `label` is the log verb phrase.
function dotSourceFrom(spec) {
  return {
    key: spec.key || "burn",
    percent: spec.percent || 0,
    turns: spec.turns || 0,
    label: spec.label || "burns for",
  };
}

// Every DOT an adventurer inflicts on hit, gathered from equipped gear (an item's
// innate `dot`) plus the Blazing enchantment. Built once when a combatant enters
// battle; `uniques` is the already-gathered unique map.
function gatherDotSources(adventurer, uniques) {
  const sources = [];
  for (const slot of EQUIPMENT_SLOTS) {
    if (slot.id === BAG_SLOT) continue;
    const item = adventurer.equipment[slot.id];
    if (item && item.dot) sources.push(dotSourceFrom(item.dot));
  }
  // Blazing is just another source — a fire DOT that shares the "burn" key, so a
  // stronger innate fire weapon and Blazing compete for the one burn slot.
  if (uniques && uniques.blazing) {
    sources.push(dotSourceFrom({ key: "burn", percent: uniques.blazing, turns: BLAZING_DURATION, label: "burns for" }));
  }
  return sources;
}

// Lay a DOT of `key` on a target: a strictly bigger per-turn tick replaces and
// refreshes an existing one of the same key; an equal/weaker one is ignored. A
// zero tick or zero duration is a no-op.
function applyDot(target, key, dmg, turns, label) {
  if (dmg <= 0 || turns <= 0) return;
  if (!target.dots) target.dots = {};
  const cur = target.dots[key];
  if (!cur || dmg > cur.dmg) {
    target.dots[key] = { dmg, turns, label: label || "burns for" };
  }
}

// Apply all of an attacker's DOT sources to a target it just hit for `dmg`. Each
// source's per-turn tick is a percent of that hit. Guards on there being sources
// (most combatants have none).
function applyHitDots(attacker, target, dmg) {
  const sources = attacker.dotSources;
  if (!sources || !sources.length || dmg <= 0) return;
  for (const src of sources) {
    const perTurn = Math.round(dmg * src.percent / 100);
    applyDot(target, src.key, perTurn, src.turns, src.label);
  }
}

// Tick every DOT on a combatant at the start of its turn: each type's damage
// skips DEF and evasion, decrements its own timer, and expired types drop off. A
// DOT can finish the victim — that resolves exactly like a normal kill (loot and
// enchantment stones for a downed enemy), and stops further ticks this turn.
function tickDot(combatant) {
  const dots = combatant.dots;
  if (!dots) return;
  for (const key of Object.keys(dots)) {
    const d = dots[key];
    combatant.hp -= d.dmg;
    logLine(`${combatant.name} ${d.label} ${d.dmg}.`, "party");
    d.turns -= 1;
    if (d.turns <= 0) delete dots[key];

    if (combatant.hp <= combatant.retreatAt) {
      combatant.hp = combatant.retreatAt;
      combatant.status = combatant.side === "party" ? "out" : "down";
      combatant.dots = {};
      logLine(
        `${combatant.name} ${combatant.side === "party" ? "retreats at 1 HP." : "is defeated!"}`,
        combatant.side === "party" ? "retreat" : "defeat"
      );
      if (combatant.side === "enemy") {
        awardLoot(combatant);
        awardEnchantStones(combatant);
      }
      return;
    }
  }
}
