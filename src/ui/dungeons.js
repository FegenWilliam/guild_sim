// Dungeons UI — the view switcher and the dungeon screens (list → detail →
// enemy), plus the copy-enemy helper. The battle screen it hands off to lives
// in ui/battle.js.

// --- View switching ------------------------------------------------------

function showView(view) {
  state.view = view;
  adventurersViewEl.classList.toggle("hidden", view !== "adventurers");
  dungeonsViewEl.classList.toggle("hidden", view !== "dungeons");
  townViewEl.classList.toggle("hidden", view !== "town");
  viewNavButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  if (view === "dungeons") renderDungeons();
  else if (view === "town") renderTown();
}

// --- Dungeon navigation --------------------------------------------------

function openDungeon(id) {
  state.selectedDungeonId = id;
  state.dungeonScreen = "detail";
  renderDungeons();
}

function backToDungeonList() {
  state.dungeonScreen = "list";
  renderDungeons();
}

function openEnemy(id) {
  state.selectedEnemyId = id;
  state.dungeonScreen = "enemy";
  renderDungeons();
}

function backToDungeonDetail() {
  state.dungeonScreen = "detail";
  renderDungeons();
}

function enterDungeon() {
  startBattle();
}

// --- Copy enemy ----------------------------------------------------------

// Build the plain-text blob copied from an enemy's page: name then one
// "STAT: value" line per stat, percentages included.
function enemyClipboardText(enemy) {
  const lines = [enemy.name];
  for (const stat of ENEMY_STAT_ORDER) {
    lines.push(`${stat}: ${formatValue(stat, enemy.stats[stat])}`);
  }
  lines.push(`XP: ${formatXP(enemyXP(enemy))}`);
  (enemy.skills || []).forEach((id) => {
    const skill = enemySkillById(id);
    if (skill) lines.push(`Skill: ${skill.name} — ${skill.description}`);
  });
  (enemy.mods || []).forEach((id) => {
    const mod = enemyModById(id);
    if (mod) lines.push(`Mod: ${mod.name} — ${mod.description}`);
  });
  return lines.join("\n");
}

function copyEnemy() {
  const enemy = ENEMIES[state.selectedEnemyId];
  if (!enemy) return;
  const text = enemyClipboardText(enemy);
  const done = () => {
    const original = "Copy name & stats";
    enemyCopyBtn.textContent = "Copied!";
    setTimeout(() => {
      enemyCopyBtn.textContent = original;
    }, 1200);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

// Clipboard API needs a secure context; fall back to a hidden textarea when
// it's unavailable (e.g. opened over file://).
function fallbackCopy(text, done) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
    done();
  } catch (err) {
    /* nothing else to try */
  }
  document.body.removeChild(area);
}

// --- Rendering -----------------------------------------------------------

function renderDungeons() {
  const screen = state.dungeonScreen;
  dungeonListEl.classList.toggle("hidden", screen !== "list");
  dungeonDetailEl.classList.toggle("hidden", screen !== "detail");
  enemyDetailEl.classList.toggle("hidden", screen !== "enemy");
  battleScreenEl.classList.toggle("hidden", screen !== "battle");

  if (screen === "list") renderDungeonList();
  else if (screen === "detail") renderDungeonDetail();
  else if (screen === "enemy") renderEnemyDetail();
  else if (screen === "battle") renderBattle();
}

function renderDungeonList() {
  dungeonListEl.innerHTML = "";
  DUNGEONS.forEach((dungeon) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "dungeon-card";

    const name = document.createElement("span");
    name.className = "dungeon-card-name";
    name.textContent = dungeon.name;

    const rec = document.createElement("span");
    rec.className = "dungeon-card-rec";
    rec.textContent = `Recommended ${dungeon.recommendation}`;

    card.append(name, rec);
    card.addEventListener("click", () => openDungeon(dungeon.id));
    dungeonListEl.appendChild(card);
  });
}

function renderDungeonDetail() {
  const dungeon = getDungeon(state.selectedDungeonId);
  if (!dungeon) return backToDungeonList();

  dungeonNameEl.textContent = dungeon.name;
  dungeonRecEl.textContent = `Recommended ${dungeon.recommendation}`;
  enterNoteEl.classList.add("hidden");

  enemyListEl.innerHTML = "";
  dungeon.enemies.forEach((enemyId) => {
    const enemy = ENEMIES[enemyId];
    if (!enemy) return;
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "enemy-entry";
    entry.textContent = enemy.name;
    entry.addEventListener("click", () => openEnemy(enemyId));
    enemyListEl.appendChild(entry);
  });
}

function renderEnemyDetail() {
  const enemy = ENEMIES[state.selectedEnemyId];
  if (!enemy) return backToDungeonDetail();

  enemyNameEl.textContent = enemy.name;
  enemyStatsEl.innerHTML = "";

  const addRow = (label, value, extraClass) => {
    const row = document.createElement("div");
    row.className = `stat-row${extraClass ? " " + extraClass : ""}`;

    const nameSpan = document.createElement("span");
    nameSpan.className = "stat-label";
    nameSpan.textContent = label;

    const valueSpan = document.createElement("span");
    valueSpan.className = "stat-value";
    valueSpan.textContent = value;

    row.append(nameSpan, valueSpan);
    enemyStatsEl.appendChild(row);
  };

  ENEMY_STAT_ORDER.forEach((label) => {
    addRow(label, formatValue(label, enemy.stats[label]));
  });
  // XP this enemy is worth (the hidden spawn stat is deliberately not shown).
  addRow("XP", formatXP(enemyXP(enemy)), "xp-row");

  // Skills and mods, if any: one row each, name in the label and its one-line
  // description in the value. These come from the shared enemy-skill/-mod pools.
  (enemy.skills || []).forEach((id) => {
    const skill = enemySkillById(id);
    if (skill) addRow(`Skill — ${skill.name}`, skill.description, "enemy-power-row");
  });
  (enemy.mods || []).forEach((id) => {
    const mod = enemyModById(id);
    if (mod) addRow(`Mod — ${mod.name}`, mod.description, "enemy-power-row");
  });
}
