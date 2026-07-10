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
    battleResultEl.classList.remove("hidden");
    battleResultEl.classList.toggle("victory", battle.result === "victory");
    battleResultEl.classList.toggle("defeat", battle.result === "defeat");
    battleResultEl.textContent =
      battle.result === "victory" ? "Victory!" : "Defeat…";
  } else {
    battleResultEl.classList.add("hidden");
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
