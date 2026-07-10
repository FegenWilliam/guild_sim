// Battle — the autobattler.
// A round is: every adventurer attacks once, in roster order, then every enemy
// attacks once, in order. Rounds repeat until one side has no fighters left.
//
// Combat math:
//   - 1 ATK = 1 damage. DEF negates 0.5 damage per point (so 2 DEF cancels
//     1 ATK). Minimum damage dealt is 1 — the only way to take 0 is to evade.
//   - MATK ignores DEF entirely. A Mage's basic attack deals 50% of its MATK
//     (Mages come into their own once skills exist).
//   - CRIT% is the chance to crit; a crit multiplies damage by CRIT DMG%.
//   - EVA% is the defender's chance to dodge the hit outright (0 damage).
//
// Adventurers never die: an adventurer fights until it hits 1 HP, then it
// bows out for the rest of the battle. Enemies fight until 0 HP.
//
// Rendering lives in ui/battle.js (renderBattle); this file only mutates the
// `battle` object and drives playback.
const BATTLE_STEP_MS = 650; // pacing between attacks during playback

let battle = null;      // active battle state, or null
let battleTimer = null; // interval handle for playback

function roll(percent) {
  return Math.random() * 100 < percent;
}

// Turn an adventurer into a battle combatant. Party members retreat at 1 HP.
function partyCombatant(adventurer) {
  const s = effectiveStats(adventurer);
  return {
    name: displayName(adventurer),
    side: "party",
    hp: s.HP,
    maxHp: s.HP,
    atk: s.ATK,
    matk: s.MATK,
    def: s.DEF,
    crit: s.CRIT,
    critDmg: s["CRIT DMG"],
    eva: s.EVA,
    magic: adventurer.className === "Mage",
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

// Resolve a single attack from `attacker` against `target`, mutating the
// target's HP and status and appending to the battle log.
function resolveAttack(attacker, target) {
  if (roll(target.eva)) {
    logLine(`${target.name} evades ${attacker.name}'s attack!`, "evade");
    return;
  }

  // Mages attack with MATK (ignoring DEF) at half value; everyone else swings
  // with ATK, reduced by the target's DEF.
  let dmg = attacker.magic ? attacker.matk * 0.5 : attacker.atk;
  if (!attacker.magic) dmg -= target.def * 0.5;

  const crit = roll(attacker.crit);
  if (crit) dmg *= attacker.critDmg / 100;

  dmg = Math.max(1, Math.round(dmg));
  target.hp -= dmg;

  logLine(
    `${attacker.name} hits ${target.name} for ${dmg}${crit ? " (CRIT!)" : ""}.`,
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

function checkBattleEnd() {
  if (!battle.enemies.some(isActive)) battle.result = "victory";
  else if (!battle.party.some(isActive)) battle.result = "defeat";
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
    const target = foes.find(isActive);
    if (target) resolveAttack(attacker, target);
    checkBattleEnd();
  }

  if (battle.result === "victory") awardVictoryXP();

  renderBattle();
  if (battle.result) stopBattleTimer();
}

// On a win, split the pooled enemy XP evenly among the adventurers who entered
// and grant it (which may trigger level-ups). Runs once per battle.
function awardVictoryXP() {
  if (battle.xpAwarded) return;
  battle.xpAwarded = true;

  const recipients = battle.partyIds
    .map((id) => state.adventurers.find((a) => a.id === id))
    .filter(Boolean);
  if (recipients.length === 0) return;

  const each = battle.xpPool / recipients.length;
  recipients.forEach((a) => gainXP(a, each));

  logLine(`Each adventurer gains ${formatXP(each)} XP.`, "xp");

  // Refresh the adventurers view so its statsheet reflects the new XP/level
  // once the player switches back to it.
  render();
}

function startBattle() {
  const dungeon = getDungeon(state.selectedDungeonId);
  if (!dungeon) return;

  if (state.adventurers.length === 0) {
    enterNoteEl.textContent = "You have no adventurers to send in — hire one first.";
    enterNoteEl.classList.remove("hidden");
    return;
  }

  const party = state.adventurers.map(partyCombatant);
  const enemies = [];
  let xpPool = 0;
  dungeon.enemies.forEach((id) => {
    const def = ENEMIES[id];
    if (!def) return;
    enemies.push(enemyCombatant(def));
    xpPool += enemyXP(def); // every enemy contributes; the pool is split on a win
  });
  disambiguate(enemies);

  battle = {
    dungeonName: dungeon.name,
    party,
    // Award XP to exactly the adventurers who entered, by id, even if some
    // retreated by the end.
    partyIds: state.adventurers.map((a) => a.id),
    enemies,
    xpPool,
    xpAwarded: false,
    queue: [],
    round: 0,
    log: [{ text: `You enter ${dungeon.name}.`, kind: "" }],
    result: null,
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
  battle = null;
  state.dungeonScreen = "detail";
  renderDungeons();
}
