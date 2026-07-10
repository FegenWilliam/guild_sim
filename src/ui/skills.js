// Skills UI — the Skills tab on the statsheet. Shows the adventurer's skill
// points and targeting strategy, then lists their class skills with level, cost
// and effect. Skill points (earned per character level) unlock a new skill or
// level up one already learned; unlocks respect each skill's prerequisite.
// Reads the catalog in data/skills.js; the actions here mutate the adventurer.

// --- Actions --------------------------------------------------------------

// Spend a skill point to learn a skill for the first time (at Lv 1).
function unlockSkill(skillId) {
  const selected = getSelected();
  if (!selected) return;
  const skill = skillById(skillId);
  if (!skill || !canUnlockSkill(selected, skill)) return;
  selected.skills[skill.id] = 1;
  selected.skillPoints -= 1;
  render(); // re-renders the tab and autosaves via scheduleSave
}

// Spend a skill point to raise an already-learned skill by one level.
function levelUpSkill(skillId) {
  const selected = getSelected();
  if (!selected) return;
  const skill = skillById(skillId);
  if (!skill || !canLevelUpSkill(selected, skill)) return;
  selected.skills[skill.id] += 1;
  selected.skillPoints -= 1;
  render();
}

// Set the adventurer's battle targeting preference ("lowest" | "highest").
function setStrategy(value) {
  const selected = getSelected();
  if (!selected) return;
  selected.strategy = value === "highest" ? "highest" : "lowest";
  render();
}

// --- Rendering -----------------------------------------------------------

// The concrete MP cost for this adventurer at the skill's current level (Lv 1
// if not yet learned), after any per-level cost reductions.
function skillCostLabel(adventurer, skill) {
  const level = Math.max(1, skillLevel(adventurer, skill.id));
  return `${skillCost(skill, maxMp(adventurer), level)} MP`;
}

// The header row: skill-point balance and the Lowest/Highest strategy toggle.
function renderSkillsHeader(adventurer) {
  const header = document.createElement("div");
  header.className = "skills-header";

  const points = document.createElement("div");
  points.className = "skill-points";
  points.innerHTML = `Skill Points: <span>${adventurer.skillPoints || 0}</span>`;

  const strat = document.createElement("div");
  strat.className = "strategy-toggle";
  const stratLabel = document.createElement("span");
  stratLabel.className = "strategy-label";
  stratLabel.textContent = "Target:";
  strat.appendChild(stratLabel);
  ["lowest", "highest"].forEach((value) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "strategy-btn";
    if ((adventurer.strategy || "lowest") === value) btn.classList.add("active");
    btn.textContent = value === "lowest" ? "Lowest HP" : "Highest HP";
    btn.addEventListener("click", () => setStrategy(value));
    strat.appendChild(btn);
  });

  header.append(points, strat);
  return header;
}

// Build one skill card: name, level, cost, description, and a state-dependent
// action (Unlock / Level Up / Max badge, or a locked "Requires …" note).
function skillCard(adventurer, skill) {
  const learned = hasLearned(adventurer, skill.id);
  const level = skillLevel(adventurer, skill.id);
  const locked = !learned && !prereqMet(adventurer, skill);

  const card = document.createElement("div");
  card.className = "skill-card";
  if (learned) card.classList.add("learned");
  if (locked) card.classList.add("locked");

  const head = document.createElement("div");
  head.className = "skill-head";

  const name = document.createElement("span");
  name.className = "skill-name";
  name.textContent = learned ? `${skill.name} · Lv ${level}/${SKILL_LEVEL_CAP}` : skill.name;

  const cost = document.createElement("span");
  cost.className = "skill-cost";
  cost.textContent = skillCostLabel(adventurer, skill);

  head.append(name, cost);

  const desc = document.createElement("p");
  desc.className = "skill-desc";
  desc.textContent = skill.description;

  card.append(head, desc);

  // Footer: the action or state for this skill.
  const foot = document.createElement("div");
  foot.className = "skill-foot";

  if (learned && level >= SKILL_LEVEL_CAP) {
    foot.appendChild(makeBadge("★ Max Level"));
  } else if (learned) {
    foot.appendChild(
      makeActionButton("Level Up (1 SP)", () => levelUpSkill(skill.id), canLevelUpSkill(adventurer, skill))
    );
  } else if (locked) {
    foot.appendChild(makeNote(requirementText(skill)));
  } else {
    foot.appendChild(
      makeActionButton("Unlock (1 SP)", () => unlockSkill(skill.id), canUnlockSkill(adventurer, skill))
    );
  }

  card.appendChild(foot);
  return card;
}

function makeActionButton(label, onClick, enabled) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "skill-learn";
  btn.textContent = label;
  btn.disabled = !enabled; // greyed out when there aren't enough skill points
  btn.addEventListener("click", onClick);
  return btn;
}

function makeBadge(text) {
  const badge = document.createElement("span");
  badge.className = "skill-badge";
  badge.textContent = text;
  return badge;
}

function makeNote(text) {
  const note = document.createElement("span");
  note.className = "skill-req";
  note.textContent = text;
  return note;
}

function renderSkills(selected) {
  skillsEl.innerHTML = "";
  skillsEl.appendChild(renderSkillsHeader(selected));

  const skills = skillsForClass(selected.className);
  if (!skills.length) {
    const empty = document.createElement("p");
    empty.className = "skill-empty";
    empty.textContent = "No skills available for this class yet.";
    skillsEl.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "skill-list";
  skills.forEach((skill) => list.appendChild(skillCard(selected, skill)));
  skillsEl.appendChild(list);
}
