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
  // Unique enchantments live on equipped gear (dormant until wearing gear is
  // wired up). Andragolas is the one that reshapes the statline up front: it
  // scales the HP/MP pools before anything enters.
  const u = gatherUniques(adventurer);
  let maxHp = s.HP;
  let maxMp = s.MP;
  if (u.andragolas) {
    maxHp = Math.round(s.HP * (1 + u.andragolas / 100));
    maxMp = Math.round(s.MP * (1 + u.andragolas / 100));
  }
  const daily = adventurer.enchantDaily || {};
  return {
    id: adventurer.id,
    name: displayName(adventurer),
    side: "party",
    hp: currentHp(adventurer),
    maxHp,
    // MP carries over between runs just like HP — it enters at its persisted
    // value and only refills on Pass Day.
    mp: currentMp(adventurer),
    maxMp,
    atk: s.ATK,
    matk: s.MATK,
    def: s.DEF,
    crit: s.CRIT,
    critDmg: s["CRIT DMG"],
    eva: s.EVA,
    magic: adventurer.className === "Mage",
    className: adventurer.className,
    // The full statline, learned skills ({ id: level } map), and targeting
    // preference ride along so the AI can pick and aim skills mid-fight. Skill
    // damage scales off primaries (DEX/INT) and the skill's level.
    stats: s,
    skills: adventurer.skills || {},
    strategy: adventurer.strategy === "highest" ? "highest" : "lowest",
    retreatAt: 1,
    status: "active",
    // Enchantment combat state (see systems/battle.js unique hooks):
    uniques: u,
    // Damage-over-time (systems/dot.js): `dots` are burns/poisons currently on
    // this combatant; `dotSources` are the ones it inflicts on hit (innate gear
    // DOT + the Blazing enchantment).
    dots: {},
    dotSources: gatherDotSources(adventurer, u),
    vampCounter: 0,        // turns toward the next Vampiric heal
    vampProc: false,       // this turn's damage heals (Vampiric)
    ampUses: {},           // per-skill cast count (Amplified Mana)
    shieldActive: 0,       // DEF banked for the next hit (Magical Shield)
    snipeStacks: 0,        // Sniper's Focus stacks
    mpBoostUsed: !!daily.mpBoost,   // once-per-day MP Boost spent today
    lastStandUsed: !!daily.lastStand, // once-per-day Last Stand spent today
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
    // The loot table rides along so a kill can roll drops without another
    // lookup back into ENEMIES.
    loot: enemy.loot || [],
    // The XP this enemy is worth also drives its enchantment-stone drop odds,
    // so cache it once here rather than re-deriving from stats on every kill.
    xp: enemyXP(enemy),
    // Enemies can catch a party member's DOT, and may inflict one of their own
    // if their definition carries an innate `dot` (systems/dot.js).
    dots: {},
    dotSources: enemy.dot ? [dotSourceFrom(enemy.dot)] : [],
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

  // Magical Shield: a struck party member banks DEF for the *next* hit only.
  // Spend whatever's banked on this hit, then re-arm it below if it survives.
  const shielded = target.side === "party" && target.uniques && target.uniques.magicalShield;
  let extraDef = 0;
  if (shielded) {
    extraDef = target.shieldActive || 0;
    target.shieldActive = 0;
  }

  let dmg = baseDamage;
  if (!ignoreDef) dmg -= (target.def + extraDef) * 0.5;

  const crit = roll(attacker.crit);
  if (crit) dmg *= attacker.critDmg / 100;

  dmg = Math.max(1, Math.round(dmg));
  target.hp -= dmg;

  logLine(
    `${attacker.name} ${label ? `${label} hits` : "hits"} ${target.name} for ${dmg}${crit ? " (CRIT!)" : ""}.`,
    attacker.side === "party" ? "party" : "enemy"
  );

  // Vampiric: when the proc is up, the attacker drains a cut of the damage —
  // resolved before the death check so even a killing blow heals, and consumed
  // so a multi-hit skill only drains once.
  if (attacker.side === "party" && attacker.vampProc && dmg > 0) {
    const heal = Math.round(dmg * VAMPIRIC_HEAL / 100);
    if (heal > 0) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      logLine(`${attacker.name} drains ${heal} HP.`, "party");
    }
    attacker.vampProc = false;
  }

  // Last Stand: a lethal blow on a party member is shrugged off once per day,
  // holding at a fraction of max HP instead of retreating.
  if (
    target.side === "party" && target.hp <= target.retreatAt &&
    target.uniques && target.uniques.lastStand && !target.lastStandUsed
  ) {
    target.lastStandUsed = true;
    target.hp = Math.max(target.retreatAt + 1, Math.round(target.maxHp * target.uniques.lastStand / 100));
    logLine(`${target.name} makes a Last Stand and holds at ${target.hp} HP!`, "skill");
  }

  if (target.hp <= target.retreatAt) {
    target.hp = target.retreatAt;
    target.status = target.side === "party" ? "out" : "down";
    logLine(
      `${target.name} ${target.side === "party" ? "retreats at 1 HP." : "is defeated!"}`,
      target.side === "party" ? "retreat" : "defeat"
    );
    // A defeated enemy rolls its loot table into the party's bags, then rolls
    // its enchantment stones into the guild's (uncapped) wallet.
    if (target.side === "enemy") {
      awardLoot(target);
      awardEnchantStones(target);
    }
    return; // downed: nothing left to shield or burn
  }

  // Survived the hit — re-arm the shield and lay any damage-over-time. The DOT
  // system (systems/dot.js) owns which sources apply (an innate weapon DOT, the
  // Blazing enchantment, …); this hit just feeds it the damage dealt.
  if (shielded) target.shieldActive = target.uniques.magicalShield;
  applyHitDots(attacker, target, dmg);
}

// Roll a defeated enemy's loot and stash each drop in the first party member who
// has a free inventory slot. When every bag is full the drop is lost — the log
// says so, which is the nudge to sell loot or grab a bag.
function awardLoot(enemyCombatant) {
  const drops = rollLoot(enemyCombatant.loot);
  for (const loot of drops) {
    const carrier = battle.partyIds
      .map((id) => state.adventurers.find((a) => a.id === id))
      .find((a) => a && inventoryHasSpace(a));
    if (carrier) {
      addToInventory(carrier, createLootItem(loot));
      logLine(`${enemyCombatant.name} dropped ${loot.name}!`, "loot");
    } else {
      logLine(`${enemyCombatant.name} dropped ${loot.name}, but the bags are full.`, "loot");
    }
  }
}

// Roll a defeated enemy's enchantment stones (odds scale with the XP it's
// worth) and bank each into the guild-wide wallet. Stones aren't inventory
// items and have no cap, so a drop can never be lost to a full bag.
function awardEnchantStones(enemyCombatant) {
  const drops = rollEnchantDrops(enemyCombatant.xp);
  for (const tierId of drops) {
    state.enchantStones[tierId] = (state.enchantStones[tierId] || 0) + 1;
    logLine(`${enemyCombatant.name} dropped a ${enchantTierById(tierId).name} Enchantment Stone!`, "loot");
  }
}

// The percent damage bonus a combatant's currently-banked Sniper's Focus
// (Sniping) grants everything it does this turn. Read before the stacks change.
function snipePct(attacker) {
  const u = attacker.uniques || {};
  if (!u.sniping) return 0;
  return (attacker.snipeStacks || 0) * SNIPING_STEP;
}

// Resolve a single basic attack from `attacker` against `target`. Mages swing
// with half their MATK ignoring DEF; everyone else swings with ATK. Sniper's
// Focus scales the swing.
function resolveAttack(attacker, target) {
  const base = attacker.magic ? attacker.matk * 0.5 : attacker.atk;
  const mult = 1 + snipePct(attacker) / 100;
  dealHit(attacker, target, base * mult, { ignoreDef: attacker.magic });
}

// Order the still-active foes by the attacker's targeting strategy: "lowest"
// puts the weakest-HP foe first (finish them off), "highest" the toughest.
function orderFoesByStrategy(attacker, foes) {
  const active = foes.filter(isActive);
  const dir = attacker.strategy === "highest" ? -1 : 1;
  return active.sort((a, b) => dir * (a.hp - b.hp) || 0);
}

// The damage a skill would land on a target *without* a crit or a dodge — the
// floor the AI uses to decide whether a hit would finish a lone enemy.
function estimateSkillDamage(attacker, skill, target) {
  let dmg = skillDamage(attacker.stats, skill, skillLevel(attacker, skill.id));
  if (!skillIgnoresDef(skill)) dmg -= target.def * 0.5;
  return Math.max(1, Math.round(dmg));
}

// Pick a skill for a combatant to use this turn against `foes`, or null to fall
// back to a basic attack. Only party members carry skills. We take the first
// learned, affordable, *appropriate* skill in catalog order (starter first):
// a multi-target skill is only worth casting when 2+ enemies are up, or when it
// would finish a lone enemy; single-target skills fire whenever affordable.
function chooseSkill(attacker, foes) {
  if (attacker.side !== "party" || !attacker.skills) return null;

  const active = foes.filter(isActive);
  if (!active.length) return null;

  for (const id of SKILL_ORDER) {
    if (!hasLearned(attacker, id)) continue;
    const skill = skillById(id);
    const level = skillLevel(attacker, id);
    if (attacker.mp < skillCost(skill, attacker.maxMp, level)) continue;

    if (skillMaxTargets(skill, level) >= 2 && active.length < 2) {
      // A single foe left: only spend the AoE if it would put them down.
      const lone = orderFoesByStrategy(attacker, active)[0];
      if (estimateSkillDamage(attacker, skill, lone) < lone.hp) continue;
    }
    return skill;
  }
  return null;
}

// Land one volley of a skill: aim by strategy, hit up to its (leveled) target
// count. Split out so Repeat can fire it again, re-aiming at whoever's left.
// `turnPct` is the flat damage bonus this turn (Sniping + Amplified Mana); Big
// Sweep is added here since it depends on how many targets this volley finds.
function skillVolley(attacker, skill, level, foes, turnPct) {
  const maxTargets = skillMaxTargets(skill, level);
  const targets = orderFoesByStrategy(attacker, foes).slice(0, maxTargets);
  if (!targets.length) return;

  let pct = turnPct || 0;
  // Big Sweep: a Warrior skill hitting fewer than its max targets concentrates,
  // dealing more per "missing" target — a lone target eats the whole surplus.
  const u = attacker.uniques || {};
  if (u.bigSweep && attacker.className === "Warrior") {
    pct += Math.max(0, maxTargets - targets.length) * u.bigSweep;
  }

  const base = skillDamage(attacker.stats, skill, level) * (1 + pct / 100);
  const ignoreDef = skillIgnoresDef(skill);
  targets.forEach((t) => dealHit(attacker, t, base, { ignoreDef, label: skill.name }));
}

// Resolve a skill: pay its MP once, then fire its volley — plus one more volley
// per Repeat the skill has at this level, re-aiming each time (stopping early if
// no foes remain). Damage/targets/cost all come from the skill's leveled params.
function resolveSkill(attacker, skill, foes) {
  const level = skillLevel(attacker, skill.id);
  const cost = skillCost(skill, attacker.maxMp, level);
  attacker.mp = Math.max(0, attacker.mp - cost);
  logLine(`${attacker.name} uses ${skill.name}! (-${cost} MP)`, "skill");

  // Damage bonuses that hold for every volley this turn: Sniper's Focus, plus
  // Amplified Mana's stacking bonus for repeat casts of the *same* mage skill.
  let turnPct = snipePct(attacker);
  const u = attacker.uniques || {};
  if (u.amplified && attacker.magic) {
    const prior = attacker.ampUses[skill.id] || 0;
    turnPct += Math.min(u.amplified, prior * AMPLIFIED_STEP);
    attacker.ampUses[skill.id] = prior + 1;
  }

  const volleys = 1 + skillRepeat(skill, level);
  for (let i = 0; i < volleys; i++) {
    if (i > 0) logLine(`${skill.name} repeats!`, "skill");
    skillVolley(attacker, skill, level, foes, turnPct);
    if (!foes.some(isActive)) break; // nothing left to hit
  }
}

// After a party member acts, advance its Sniper's Focus: a basic attack banks a
// stack (up to the cap), a skill spends the built-up focus and resets to zero.
function updateSnipe(attacker, usedSkill) {
  const u = attacker.uniques || {};
  if (!u.sniping) return;
  attacker.snipeStacks = usedSkill ? 0 : Math.min(u.sniping, (attacker.snipeStacks || 0) + 1);
}

// Advance a party member's Vampiric timer at the start of its turn; when it
// comes due, this turn's damage will heal (a 0-turn roll heals every turn).
function vampireTick(attacker) {
  const u = attacker.uniques || {};
  if (u.vampiric === undefined) return;
  const every = Math.max(1, u.vampiric);
  attacker.vampCounter = (attacker.vampCounter || 0) + 1;
  if (attacker.vampCounter >= every) {
    attacker.vampProc = true;
    attacker.vampCounter = 0;
  }
}

// MP Boost: once per day, refill a slice of MP the moment a party member drops
// below the low-MP threshold. Checked after it acts (and has spent MP).
function tryMpBoost(attacker) {
  const u = attacker.uniques || {};
  if (!u.mpBoost || attacker.mpBoostUsed) return;
  if (attacker.mp < attacker.maxMp * (MP_BOOST_THRESHOLD / 100)) {
    attacker.mpBoostUsed = true;
    const restored = Math.round(attacker.maxMp * u.mpBoost / 100);
    attacker.mp = Math.min(attacker.maxMp, attacker.mp + restored);
    logLine(`${attacker.name}'s MP Boost restores ${restored} MP!`, "skill");
  }
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

// Copy each party combatant's live HP and MP back onto its adventurer so damage
// taken and MP spent in the dungeon persist once the run ends (or the player
// leaves).
function syncPartyHp() {
  for (const c of battle.party) {
    const adv = state.adventurers.find((a) => a.id === c.id);
    if (adv) {
      adv.hp = c.hp;
      adv.mp = c.mp;
      // Persist once-per-day enchantment use (MP Boost / Last Stand) so it can't
      // be reset by leaving and re-entering — only Pass Day clears it.
      adv.enchantDaily = { mpBoost: !!c.mpBoostUsed, lastStand: !!c.lastStandUsed };
    }
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
    // A Blazing burn bites at the start of the victim's turn — it can drop the
    // attacker before it ever swings.
    tickDot(attacker);
    if (isActive(attacker)) {
      const foes = attacker.side === "party" ? battle.enemies : battle.party;
      // Advance the Vampiric timer before the swing so this turn can heal.
      if (attacker.side === "party") vampireTick(attacker);
      // Use a skill if one's affordable and appropriate, else a basic attack. A
      // party member aims by its strategy; enemies just hit the first foe up.
      const skill = chooseSkill(attacker, foes);
      if (skill) {
        resolveSkill(attacker, skill, foes);
      } else {
        const target =
          attacker.side === "party"
            ? orderFoesByStrategy(attacker, foes)[0]
            : foes.find(isActive);
        if (target) resolveAttack(attacker, target);
      }
      // Post-turn enchantment upkeep for party members: bank/spend Sniper's
      // Focus, top up MP if it bottomed out, and let the Vampiric proc lapse.
      if (attacker.side === "party") {
        updateSnipe(attacker, !!skill);
        tryMpBoost(attacker);
        attacker.vampProc = false;
      }
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
  // Power of Friendship: each member gains ATK for every *other* adventurer who
  // entered. Fixed at entry, so retreats along the way don't sap it.
  const others = party.length - 1;
  if (others > 0) {
    for (const c of party) {
      if (c.uniques && c.uniques.friendship) c.atk += c.uniques.friendship * others;
    }
  }
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
