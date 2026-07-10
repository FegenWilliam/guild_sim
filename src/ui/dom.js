// DOM references — every element the UI touches, resolved once. Loaded after
// the markup (scripts sit at the end of <body>), so getElementById is safe.

// Topbar + roster + hire.
const dayEl = document.getElementById("day");
const goldEl = document.getElementById("gold");
const countEl = document.getElementById("count");
const maxEl = document.getElementById("max");
const rosterEl = document.getElementById("roster");
const hireBtn = document.getElementById("hire");
const passDayBtn = document.getElementById("passDay");

// Save controls.
const exportSaveBtn = document.getElementById("exportSave");
const importSaveBtn = document.getElementById("importSave");
const importFileEl = document.getElementById("importFile");
const saveNoteEl = document.getElementById("saveNote");

// Statsheet.
const statsheetEl = document.getElementById("statsheet");
const nameEl = document.getElementById("name");
const classEl = document.getElementById("class");
const levelEl = document.getElementById("level");
const xpFillEl = document.getElementById("xpFill");
const xpTextEl = document.getElementById("xpText");
const hpFillEl = document.getElementById("hpFill");
const hpTextEl = document.getElementById("hpText");
const mpFillEl = document.getElementById("mpFill");
const mpTextEl = document.getElementById("mpText");
const statsEl = document.getElementById("stats");
const equipmentEl = document.getElementById("equipment");
const inventoryPanelEl = document.getElementById("inventoryPanel");
const inventoryEl = document.getElementById("inventory");
const invUnlockedEl = document.getElementById("invUnlocked");
const sellLootBtn = document.getElementById("sellLoot");
const skillsPanelEl = document.getElementById("skillsPanel");
const skillsEl = document.getElementById("skills");
const tabButtons = document.querySelectorAll(".tab");
const emptyHintEl = document.getElementById("emptyHint");

// Maps each tab to the panel it shows.
const TAB_PANELS = {
  stats: statsEl,
  equipment: equipmentEl,
  inventory: inventoryPanelEl,
  skills: skillsPanelEl,
};

// Class picker modal.
const classModalEl = document.getElementById("classModal");
const classChoicesEl = document.getElementById("classChoices");

// Confirmation modal (Pass Day, etc.).
const confirmModalEl = document.getElementById("confirmModal");
const confirmTitleEl = document.getElementById("confirmTitle");
const confirmMsgEl = document.getElementById("confirmMsg");
const confirmOkBtn = document.getElementById("confirmOk");
const confirmCancelBtn = document.getElementById("confirmCancel");

// View switcher.
const viewNavButtons = document.querySelectorAll(".viewnav-btn");
const adventurersViewEl = document.getElementById("adventurersView");
const dungeonsViewEl = document.getElementById("dungeonsView");
const townViewEl = document.getElementById("townView");

// Town view: service switcher + the Equipment Shop (grid and item detail).
const townNavButtons = document.querySelectorAll(".townnav-btn");
const shopServiceEl = document.getElementById("shopService");
const shopGridEl = document.getElementById("shopGrid");
const shopDetailEl = document.getElementById("shopDetail");
const shopBackBtn = document.getElementById("shopBack");
const shopItemNameEl = document.getElementById("shopItemName");
const shopItemSlotEl = document.getElementById("shopItemSlot");
const shopBonusesEl = document.getElementById("shopBonuses");
const shopModifiersEl = document.getElementById("shopModifiers");
const shopPriceEl = document.getElementById("shopPrice");
const shopBuyBtn = document.getElementById("shopBuy");
const shopNoteEl = document.getElementById("shopNote");

// Dungeon view: list, detail, enemy detail.
const dungeonListEl = document.getElementById("dungeonList");
const dungeonDetailEl = document.getElementById("dungeonDetail");
const dungeonNameEl = document.getElementById("dungeonName");
const dungeonRecEl = document.getElementById("dungeonRec");
const dungeonBackBtn = document.getElementById("dungeonBack");
const dungeonEnterBtn = document.getElementById("dungeonEnter");
const enterNoteEl = document.getElementById("enterNote");
const enemyListEl = document.getElementById("enemyList");
const enemyDetailEl = document.getElementById("enemyDetail");
const enemyNameEl = document.getElementById("enemyName");
const enemyStatsEl = document.getElementById("enemyStats");
const enemyBackBtn = document.getElementById("enemyBack");
const enemyCopyBtn = document.getElementById("enemyCopy");

// Battle screen.
const battleScreenEl = document.getElementById("battleScreen");
const battleTitleEl = document.getElementById("battleTitle");
const battlePartyEl = document.getElementById("battleParty");
const battleEnemiesEl = document.getElementById("battleEnemies");
const battleResultEl = document.getElementById("battleResult");
const battleLogEl = document.getElementById("battleLog");
const battleBackBtn = document.getElementById("battleBack");
