/**
 * game.mode.js
 * ─────────────
 * Phase 1 scope: framework only — no game logic here yet.
 * Phase 3 will flesh this out with the Game Mode menu
 * (Tic Tac Toe / Guess Number / Rock Paper Scissors) and wire the
 * existing /game endpoint's logic into onEnter/onExit + submenu state.
 */

module.exports = {
  id: "GAME",
  label: "Game",
  ackLine: "Entering Game Mode.",

  onEnter() {
    // Phase 3: reset/select active mini-game here.
  },

  onExit() {
    // Phase 3: clear any in-progress mini-game state here.
  },
};
