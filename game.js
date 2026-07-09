// Guild Sim — prototype
// Player manages adventurers. For now: a max cap and a current count.

const state = {
  adventurers: 1,
  maxAdventurers: 1,
};

const countEl = document.getElementById("count");
const maxEl = document.getElementById("max");
const hireBtn = document.getElementById("hire");

function render() {
  countEl.textContent = state.adventurers;
  maxEl.textContent = state.maxAdventurers;
  hireBtn.disabled = state.adventurers >= state.maxAdventurers;
}

function hireNewbie() {
  if (state.adventurers >= state.maxAdventurers) return;
  state.adventurers += 1;
  render();
}

hireBtn.addEventListener("click", hireNewbie);

render();
