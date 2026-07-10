// Battle UI — renders the active battle (`battle` in systems/battle.js): the
// party and enemy columns with HP bars, the result banner, and the log.

function battleUnitCard(combatant) {
  const card = document.createElement("div");
  card.className = `battle-unit ${combatant.side}`;
  if (combatant.status === "out") card.classList.add("out");
  if (combatant.status === "down") card.classList.add("down");

  const head = document.createElement("div");
  head.className = "battle-unit-head";

  const name = document.createElement("span");
  name.className = "battle-unit-name";
  name.textContent = combatant.name;

  const hpNum = document.createElement("span");
  hpNum.className = "battle-unit-hp";
  hpNum.textContent = `${combatant.hp} / ${combatant.maxHp}`;

  head.append(name, hpNum);

  const bar = document.createElement("div");
  bar.className = "hpbar";
  const fill = document.createElement("div");
  fill.className = "hpbar-fill";
  fill.style.width = `${Math.max(0, (combatant.hp / combatant.maxHp) * 100)}%`;
  bar.appendChild(fill);

  card.append(head, bar);
  return card;
}

function renderBattle() {
  if (!battle) return;

  battleTitleEl.textContent = battle.dungeonName;

  battlePartyEl.innerHTML = "";
  battle.party.forEach((c) => battlePartyEl.appendChild(battleUnitCard(c)));

  battleEnemiesEl.innerHTML = "";
  battle.enemies.forEach((c) => battleEnemiesEl.appendChild(battleUnitCard(c)));

  if (battle.result) {
    // The run always ends the same way — the party retreats — so there's a
    // single "over" banner reporting how many waves they cleared.
    const cleared = battle.wavesCleared;
    battleResultEl.classList.remove("hidden");
    battleResultEl.classList.add("over");
    battleResultEl.textContent =
      cleared > 0
        ? `Run over — cleared ${cleared} wave${cleared === 1 ? "" : "s"}!`
        : "Run over — the party was overwhelmed.";
  } else {
    battleResultEl.classList.add("hidden");
    battleResultEl.classList.remove("over");
  }

  battleLogEl.innerHTML = "";
  battle.log.forEach((entry) => {
    const line = document.createElement("div");
    line.className = `log-line ${entry.kind}`;
    line.textContent = entry.text;
    battleLogEl.appendChild(line);
  });
  battleLogEl.scrollTop = battleLogEl.scrollHeight;
}
