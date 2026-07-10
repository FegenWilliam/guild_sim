// Day system — the main brake on grinding dungeons.
//
// Adventurers' HP is kept between dungeon runs (see systems/battle.js), so once
// a party is worn down it stays worn down. Passing the day is the only way to
// heal them back to full, which naturally caps a well-fought run to roughly one
// per day. Advancing the day is player-driven via the Pass Day button.

// Heal a single adventurer back to full HP.
function healAdventurer(adventurer) {
  adventurer.hp = maxHp(adventurer);
}

// Heal the whole roster to full.
function healParty() {
  state.adventurers.forEach(healAdventurer);
}

// Advance to the next day: the party rests up (full heal) and the day counter
// ticks over. Persists and re-renders.
function passDay() {
  state.day += 1;
  healParty();
  saveGame();
  render();
}
