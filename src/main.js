// Guild Sim — entry point.
// Wires up event listeners and does the first render. Loaded last, after every
// system and UI module has defined its globals.

function init() {
  // Restore saved progress before the first render so a refresh keeps the guild.
  loadGame();

  renderClassChoices();

  hireBtn.addEventListener("click", hireNewbie);

  passDayBtn.addEventListener("click", () => {
    openConfirm({
      title: `Pass to Day ${state.day + 1}?`,
      message: "Your whole party rests and heals to full HP. Any progress in an active run is not affected.",
      okLabel: "Pass Day",
      onConfirm: passDay,
    });
  });
  confirmOkBtn.addEventListener("click", acceptConfirm);
  confirmCancelBtn.addEventListener("click", closeConfirm);
  confirmModalEl.addEventListener("click", (e) => {
    if (e.target === confirmModalEl) closeConfirm();
  });

  exportSaveBtn.addEventListener("click", exportSave);
  importSaveBtn.addEventListener("click", () => importFileEl.click());
  importFileEl.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      importSaveFile(file, (ok) => {
        if (ok) {
          render();
          flashSaveNote("Save imported.");
        } else {
          flashSaveNote("Import failed — invalid save file.");
        }
      });
    }
    importFileEl.value = ""; // let the same file be re-imported later
  });

  // Belt-and-suspenders: flush a save when the tab is closing, in case a
  // debounced save is still pending.
  window.addEventListener("beforeunload", saveGame);
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

  // Inventory: sell all unlocked loot across the guild.
  sellLootBtn.addEventListener("click", sellAllLoot);

  // Town: service switcher + Equipment Shop navigation.
  townNavButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTownService(btn.dataset.town));
  });
  shopBackBtn.addEventListener("click", backToShopGrid);
  shopBuyBtn.addEventListener("click", buyEquipment);

  // Allow cancelling a hire by clicking the backdrop or pressing Escape.
  classModalEl.addEventListener("click", (e) => {
    if (e.target === classModalEl && classModalEl.dataset.cancelable === "true") {
      closeClassPicker();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (
      !classModalEl.classList.contains("hidden") &&
      classModalEl.dataset.cancelable === "true"
    ) {
      closeClassPicker();
    } else if (!confirmModalEl.classList.contains("hidden")) {
      closeConfirm();
    }
  });

  // Player starts with 1000 gold and an empty roster: just the hire button is
  // shown. Hiring the first newbie triggers class selection and the statsheet
  // pops up once a roster exists.
  render();
}

init();
