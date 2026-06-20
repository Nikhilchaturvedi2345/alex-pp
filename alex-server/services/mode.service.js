/**
 * mode.service.js
 * ────────────────
 * Phase 1 — Mode Framework (framework only, per the roadmap).
 *
 * Owns which mode Alex is currently in, the registry of available
 * modes, and the switching logic. Each mode module under /modes
 * only needs to export a small descriptor — this service doesn't
 * care about each mode's internals yet (that's Phases 3-6).
 *
 * Other services/routes never set the mode directly — they always
 * go through switchMode() so acknowledgement lines, validation, and
 * future onEnter/onExit hooks all stay in one place.
 */

const memoryService = require("./memory.service");

const companion = require("../modes/companion.mode");
const game = require("../modes/game.mode");
const weather = require("../modes/weather.mode");
const learn = require("../modes/learn.mode");
const story = require("../modes/story.mode");

// Registry — order here is also menu order on the ESP.
const REGISTRY = {
  COMPANION: companion,
  GAME: game,
  WEATHER: weather,
  LEARN: learn,
  STORY: story,
};

const AVAILABLE_MODES = Object.keys(REGISTRY);

let currentMode = "COMPANION";

function init() {
  const memory = memoryService.get();
  if (memory.lastMode && REGISTRY[memory.lastMode]) {
    currentMode = memory.lastMode;
  }
  return currentMode;
}

function getCurrentMode() {
  return currentMode;
}

function getCurrentModeModule() {
  return REGISTRY[currentMode];
}

function getAvailableModes() {
  return AVAILABLE_MODES;
}

function isValidMode(mode) {
  return typeof mode === "string" && Boolean(REGISTRY[mode]);
}

/**
 * Switch Alex's active mode.
 * Returns { success, mode, ackLine, previousMode } — ackLine is the
 * line Alex should speak to confirm the switch (e.g. "Entering Game
 * Mode."), sourced from the mode module so each mode can eventually
 * customize its own greeting.
 */
function switchMode(requestedMode) {
  if (!isValidMode(requestedMode)) {
    return {
      success: false,
      error: `Unknown mode: ${requestedMode}`,
      availableModes: AVAILABLE_MODES,
    };
  }

  const previousMode = currentMode;
  const prevModule = REGISTRY[previousMode];
  const nextModule = REGISTRY[requestedMode];

  if (previousMode === requestedMode) {
    const reentryLine =
      typeof nextModule.getReentryLine === "function"
        ? nextModule.getReentryLine()
        : null;
    return {
      success: true,
      mode: currentMode,
      previousMode,
      ackLine: reentryLine || nextModule.ackLine,
      changed: false,
    };
  }

  if (typeof prevModule.onExit === "function") prevModule.onExit();

  currentMode = requestedMode;
  memoryService.set({ lastMode: currentMode });
  memoryService.save();

  if (typeof nextModule.onEnter === "function") nextModule.onEnter();

  return {
    success: true,
    mode: currentMode,
    previousMode,
    ackLine: nextModule.ackLine,
    changed: true,
  };
}

/**
 * Drives ESP menu rendering. Phase 1 just needs mode + availableModes;
 * later phases can extend this with per-mode submenu data.
 */
function getUIState() {
  return {
    mode: currentMode,
    availableModes: AVAILABLE_MODES,
  };
}

module.exports = {
  init,
  getCurrentMode,
  getCurrentModeModule,
  getAvailableModes,
  isValidMode,
  switchMode,
  getUIState,
};
