// Guild Sim — entry point.
// Wires up event listeners and does the first render. Loaded last, after every
// system and UI module has defined its globals.

function init() {
  renderClassChoices();

  hireBtn.addEventListener("click", hireNewbie);
  nameEl.addEventListener("input", (e) => renameSelected(e.target.value));
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  viewNavButtons.forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
  dungeonBackBtn.addEventListener("click", backToDungeonList);
  dungeonEnterBtn.addEventListener("click", enterDungeon);
  enemyBackBtn.addEventListener("click", backToDungeonDetail);
  enemyCopyBtn.addEventListener("click", copyEnemy);
  battleBackBtn.addEventListener("click", leaveBattle);

  // Allow cancelling a hire by clicking the backdrop or pressing Escape.
  classModalEl.addEventListener("click", (e) => {
    if (e.target === classModalEl && classModalEl.dataset.cancelable === "true") {
      closeClassPicker();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      !classModalEl.classList.contains("hidden") &&
      classModalEl.dataset.cancelable === "true"
    ) {
      closeClassPicker();
    }
  });

  // Player starts with 1000 gold and an empty roster: just the hire button is
  // shown. Hiring the first newbie triggers class selection and the statsheet
  // pops up once a roster exists.
  render();
}

init();
