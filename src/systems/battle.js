// Battle — the autobattler.
// A round is: every adventurer attacks once, in roster order, then every enemy
// attacks once, in order. Rounds repeat until one side has no fighters left.
//
// A dungeon run is a series of waves: clear one enemy pack and the next pack
// walks in. The party's HP carries over between waves — there's no healing — so
// a run is a war of attrition. Adventurers never die: each fights until it hits
// 1 HP, then it bows out for the rest of the run. The run ends once every
// adventurer has bowed out (all "reached 0"); that's the finish line, not a
// loss. Enemies fight until 0 HP.
//
// Combat math:
//   - 1 ATK = 1 damage. DEF negates 0.5 damage per point (so 2 DEF cancels
//     1 ATK). Minimum damage dealt is 1 — the only way to take 0 is to evade.
//   - MATK ignores DEF entirely. A Mage's basic attack deals 50% of its MATK
//     (Mages come into their own once skills exist).
//   - CRIT% is the chance to crit; a crit multiplies damage by CRIT DMG%.
//   - EVA% is the defender's chance to dodge the hit outright (0 damage).
//
// Rendering lives in ui/battle.js (renderBattle); this file only mutates the
// `battle` object and drives playback.
const BATTLE_STEP_MS = 90; // pacing between attacks during playback (~7x faster)

let battle = null;      // active battle state, or null
let battleTimer = null; // interval handle for playback

function roll(percent) {
  return Math.random() * 100 < percent;
}

// Turn an adventurer into a battle combatant. Party members retreat at 1 HP.
// They enter at their *current* (persisted) HP, not full — damage carries over
// from earlier runs until the day is passed.
function partyCombatant(adventurer) {
  const s = effectiveStats(adventurer);
  return {
    id: adventurer.id,
    name: displayName(adventurer),
    side: "party",
    hp: currentHp(adventurer),
    maxHp: s.HP,
    // MP is a per-battle resource: it opens full and drains as skills fire.
    // Unlike HP it doesn't persist between runs — a fresh run starts with a
    // full pool. (Persist it later if grinding needs another brake.)
    mp: s.MP,
    maxMp: s.MP,
    atk: s.ATK,
    matk: s.MATK,
    def: s.DEF,
    crit: s.CRIT,
    critDmg: s["CRIT DMG"],
    eva: s.EVA,
    magic: adventurer.className === "Mage",
    // The full statline and learned skills ride along so skill damage (which
    // scales off primaries like DEX/INT) can be computed mid-fight.
    stats: s,
    skills: adventurer.skills || [],
    retreatAt: 1,
    status: "active",
  };
}

// Turn an enemy definition into a battle combatant. Enemies fight to 0 HP.
function enemyCombatant(enemy) {
  const s = enemy.stats;
  return {
    name: enemy.name,
    side: "enemy",
    hp: s.HP,
    maxHp: s.HP,
    atk: s.ATK,
    matk: s.MATK || 0,
    def: s.DEF,
    crit: s.CRIT,
    critDmg: s["CRIT DMG"],
    eva: s.EVA,
    magic: false,
    retreatAt: 0,
    status: "active",
  };
}

// Give same-named enemies distinct labels (Goblin A, Goblin B, …) so the log
// and cards stay readable when a dungeon stacks duplicates.
function disambiguate(combatants) {
  const counts = {};
  for (const c of combatants) counts[c.name] = (counts[c.name] || 0) + 1;
  const seen = {};
  for (const c of combatants) {
    if (counts[c.name] > 1) {
      seen[c.name] = (seen[c.name] || 0) + 1;
      c.name = `${c.name} ${String.fromCharCode(64 + seen[c.name])}`;
    }
  }
}

const isActive = (c) => c.status === "active";

function logLine(text, kind) {
  battle.log.push({ text, kind: kind || "" });
}

// Land one hit of `baseDamage` from `attacker` on `target`: roll evasion, apply
// DEF (unless the hit ignores it), roll a crit, floor at 1, then mutate HP and
// status and log it. `label` names the source — a skill's name, or "" for a
// plain attack — so both the basic swing and every skill hit share this path.
function dealHit(attacker, target, baseDamage, { ignoreDef = false, label = "" } = {}) {
  if (roll(target.eva)) {
    logLine(
      `${target.name} evades ${attacker.name}${label ? `'s ${label}` : "'s attack"}!`,
      "evade"
    );
    return;
  }

  let dmg = baseDamage;
  if (!ignoreDef) dmg -= target.def * 0.5;

  const crit = roll(attacker.crit);
  if (crit) dmg *= attacker.critDmg / 100;

  dmg = Math.max(1, Math.round(dmg));
  target.hp -= dmg;

  logLine(
    `${attacker.name} ${label ? `${label} hits` : "hits"} ${target.name} for ${dmg}${crit ? " (CRIT!)" : ""}.`,
    attacker.side === "party" ? "party" : "enemy"
  );

  if (target.hp <= target.retreatAt) {
    target.hp = target.retreatAt;
    target.status = target.side === "party" ? "out" : "down";
    logLine(
      `${target.name} ${target.side === "party" ? "retreats at 1 HP." : "is defeated!"}`,
      target.side === "party" ? "retreat" : "defeat"
    );
  }
}

// Resolve a single basic attack from `attacker` against `target`. Mages swing
// with half their MATK ignoring DEF; everyone else swings with ATK.
function resolveAttack(attacker, target) {
  const base = attacker.magic ? attacker.matk * 0.5 : attacker.atk;
  dealHit(attacker, target, base, { ignoreDef: attacker.magic });
}

// Pick a skill for a combatant to use this turn, or null to fall back to a
// basic attack. Only party members carry skills; we take the first learned
// skill they can currently afford (learn order = priority).
function chooseSkill(attacker) {
  if (attacker.side !== "party" || !attacker.skills || !attacker.skills.length) {
    return null;
  }
  for (const id of attacker.skills) {
    const skill = skillById(id);
    if (skill && attacker.mp >= skillCost(skill, attacker.maxMp)) return skill;
  }
  return null;
}

// Resolve a skill: pay its MP, then land its damage on up to `maxTargets` of the
// still-active foes. Damage scales off the caster's full statline (so DEX/INT
// skills work); the "ignoreDef" effect makes each hit skip DEF.
function resolveSkill(attacker, skill, foes) {
  const targets = foes.filter(isActive).slice(0, skill.maxTargets || 1);
  if (!targets.length) return;

  const cost = skillCost(skill, attacker.maxMp);
  attacker.mp = Math.max(0, attacker.mp - cost);
  logLine(`${attacker.name} uses ${skill.name}! (-${cost} MP)`, "skill");

  const base = skillDamage(attacker.stats, skill);
  const ignoreDef = skillIgnoresDef(skill);
  targets.forEach((t) =>
    dealHit(attacker, t, base, { ignoreDef, label: skill.name })
  );
}

// Roll a fresh enemy pack for the current dungeon: each enemy the dungeon lists
// shows up 1–5 times based on its hidden spawn chances. Returns the disambiguated
// combatants and the XP they're collectively worth.
function rollEnemyPack(dungeon) {
  const enemies = [];
  let xpPool = 0;
  dungeon.enemies.forEach((id) => {
    const def = ENEMIES[id];
    if (!def) return;
    const count = rollSpawnCount(def);
    for (let i = 0; i < count; i++) {
      enemies.push(enemyCombatant(def));
      xpPool += enemyXP(def);
    }
  });
  disambiguate(enemies);
  return { enemies, xpPool };
}

// Copy each party combatant's live HP back onto its adventurer so damage taken
// in the dungeon persists once the run ends (or the player leaves).
function syncPartyHp() {
  for (const c of battle.party) {
    const adv = state.adventurers.find((a) => a.id === c.id);
    if (adv) adv.hp = c.hp;
  }
}

// Decide what happens after an attack: the run ends when the whole party has
// retreated, and a cleared wave rolls straight into the next one.
function checkBattleEnd() {
  if (!battle.party.some(isActive)) {
    // Every adventurer has bowed out — the run is over. Not a loss, just the
    // finish line.
    battle.result = "over";
  } else if (!battle.enemies.some(isActive)) {
    advanceWave();
  }
}

// A wave is cleared: award its XP, then send in the next pack. The party's HP
// and retreat status carry over untouched. Once a dungeon's wave cap is reached
// the run ends as a clear instead of rolling another pack.
function advanceWave() {
  const recipients = battle.partyIds
    .map((id) => state.adventurers.find((a) => a.id === id))
    .filter(Boolean);
  if (recipients.length) {
    const each = battle.xpPool / recipients.length;
    recipients.forEach((a) => gainXP(a, each));
    logLine(
      `Wave ${battle.wave} cleared! Each adventurer gains ${formatXP(each)} XP.`,
      "xp"
    );
    // Refresh the adventurers view so its statsheet reflects the new XP/level,
    // and persist the gains right away.
    render();
    saveGame();
  }

  battle.wavesCleared += 1;

  const dungeon = getDungeon(state.selectedDungeonId);
  if (dungeon.maxWaves && battle.wavesCleared >= dungeon.maxWaves) {
    // Cleared the whole dungeon. The run stops here with HP intact; the player
    // can re-enter and run it again from wave 1.
    battle.result = "cleared";
    logLine(`You cleared all ${dungeon.maxWaves} waves of ${dungeon.name}!`, "wave");
    return;
  }

  battle.wave += 1;
  const pack = rollEnemyPack(dungeon);
  battle.enemies = pack.enemies;
  battle.xpPool = pack.xpPool;
  // Drop the current round's leftover queue (it still points at the defeated
  // pack); the next step rebuilds a clean round for the new wave.
  battle.queue = [];
  logLine(`Wave ${battle.wave} approaches!`, "wave");
}

// Advance the battle by one attack. When the round's queue empties, a fresh
// round is built from whoever is still active (party first, then enemies).
function battleStep() {
  if (!battle || battle.result) return;

  if (battle.queue.length === 0) {
    battle.round += 1;
    battle.queue = [...battle.party, ...battle.enemies].filter(isActive);
  }

  let attacker = null;
  while (battle.queue.length) {
    const next = battle.queue.shift();
    if (isActive(next)) {
      attacker = next;
      break;
    }
  }

  if (attacker) {
    const foes = attacker.side === "party" ? battle.enemies : battle.party;
    // Use a skill if one's affordable, otherwise fall back to a basic attack.
    const skill = chooseSkill(attacker);
    if (skill) {
      resolveSkill(attacker, skill, foes);
    } else {
      const target = foes.find(isActive);
      if (target) resolveAttack(attacker, target);
    }
    syncPartyHp();
    checkBattleEnd();
  }

  renderBattle();
  if (battle.result) {
    stopBattleTimer();
    saveGame();
  }
}

function startBattle() {
  const dungeon = getDungeon(state.selectedDungeonId);
  if (!dungeon) return;

  if (state.adventurers.length === 0) {
    enterNoteEl.textContent = "You have no adventurers to send in — hire one first.";
    enterNoteEl.classList.remove("hidden");
    return;
  }

  // HP carries over between runs, so a fully worn-down party can't fight. Nudge
  // the player to pass the day instead of starting a run that ends instantly.
  if (state.adventurers.every((a) => currentHp(a) <= 1)) {
    enterNoteEl.textContent = "Your party is too hurt to fight — pass the day to heal.";
    enterNoteEl.classList.remove("hidden");
    return;
  }

  const party = state.adventurers.map(partyCombatant);
  const pack = rollEnemyPack(dungeon);

  battle = {
    dungeonName: dungeon.name,
    party,
    // Award XP to exactly the adventurers who entered, by id, even if some
    // retreated along the way.
    partyIds: state.adventurers.map((a) => a.id),
    enemies: pack.enemies,
    xpPool: pack.xpPool,
    wave: 1,
    wavesCleared: 0,
    queue: [],
    round: 0,
    log: [{ text: `You enter ${dungeon.name}.`, kind: "" }],
    result: null, // null while running; "over" once the party has fully retreated
  };

  state.dungeonScreen = "battle";
  renderDungeons();

  stopBattleTimer();
  battleTimer = setInterval(battleStep, BATTLE_STEP_MS);
}

function stopBattleTimer() {
  if (battleTimer !== null) {
    clearInterval(battleTimer);
    battleTimer = null;
  }
}

function leaveBattle() {
  stopBattleTimer();
  if (battle) {
    // Keep whatever HP the party has left when the player bails mid-run.
    syncPartyHp();
    saveGame();
  }
  battle = null;
  state.dungeonScreen = "detail";
  // Reflect the party's kept HP in the roster/statsheet.
  render();
  renderDungeons();
}
