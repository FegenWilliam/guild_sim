// Skills UI — the Skills tab on the statsheet. Lists the selected adventurer's
// class skills, shows each one's cost and effect, and learns them (respecting
// prerequisites). Reads the catalog in data/skills.js; the learn action mutates
// the adventurer's `skills` list and re-renders.

// --- Action --------------------------------------------------------------

function learnSkill(skillId) {
  const selected = getSelected();
  if (!selected) return;
  const skill = skillById(skillId);
  if (!skill || !canLearnSkill(selected, skill)) return;
  selected.skills.push(skill.id);
  render(); // re-renders the tab and autosaves via scheduleSave
}

// --- Rendering -----------------------------------------------------------

// Human-readable MP cost, e.g. "20 MP" or "10% MP".
function skillCostLabel(skill) {
  const c = skill.cost;
  return c.type === "percent" ? `${c.amount}% MP` : `${c.amount} MP`;
}

// Build one skill card: name + cost, description, and a state-dependent action
// (Learned badge / Learn button / locked "Requires …" note).
function skillCard(adventurer, skill) {
  const learned = hasLearned(adventurer, skill.id);
  const locked = !learned && !prereqMet(adventurer, skill);

  const card = document.createElement("div");
  card.className = "skill-card";
  if (learned) card.classList.add("learned");
  if (locked) card.classList.add("locked");

  const head = document.createElement("div");
  head.className = "skill-head";

  const name = document.createElement("span");
  name.className = "skill-name";
  name.textContent = skill.name;

  const cost = document.createElement("span");
  cost.className = "skill-cost";
  cost.textContent = skillCostLabel(skill);

  head.append(name, cost);

  const desc = document.createElement("p");
  desc.className = "skill-desc";
  desc.textContent = skill.description;

  card.append(head, desc);

  // Footer: the current state — already learned, learnable, or gated by a
  // prerequisite that hasn't been learned yet.
  const foot = document.createElement("div");
  foot.className = "skill-foot";

  if (learned) {
    const badge = document.createElement("span");
    badge.className = "skill-badge";
    badge.textContent = "✓ Learned";
    foot.appendChild(badge);
  } else if (locked) {
    const prereq = skillById(skill.requires);
    const note = document.createElement("span");
    note.className = "skill-req";
    note.textContent = `Requires ${prereq ? prereq.name : skill.requires}`;
    foot.appendChild(note);
  } else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "skill-learn";
    btn.textContent = "Learn";
    btn.addEventListener("click", () => learnSkill(skill.id));
    foot.appendChild(btn);
  }

  card.appendChild(foot);
  return card;
}

function renderSkills(selected) {
  skillsEl.innerHTML = "";
  const skills = skillsForClass(selected.className);

  if (!skills.length) {
    const empty = document.createElement("p");
    empty.className = "skill-empty";
    empty.textContent = "No skills available for this class yet.";
    skillsEl.appendChild(empty);
    return;
  }

  skills.forEach((skill) => skillsEl.appendChild(skillCard(selected, skill)));
}
