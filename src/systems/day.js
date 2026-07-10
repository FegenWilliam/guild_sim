// Day system — the main brake on grinding dungeons.
//
// Adventurers' HP and MP are kept between dungeon runs (see systems/battle.js),
// so once a party is worn down (or out of MP) it stays that way. Passing the day
// is the only way to refill both to full, which naturally caps a well-fought run
// to roughly one per day. Advancing the day is player-driven via the Pass Day
// button.

// Heal a single adventurer back to full HP and MP.
function healAdventurer(adventurer) {
  adventurer.hp = maxHp(adventurer);
  adventurer.mp = maxMp(adventurer);
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
