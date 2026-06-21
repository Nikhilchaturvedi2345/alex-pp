/**
 * mode.service.js
 * ────────────────
 * Mode registry and switching with onEnter/onExit hooks.
 */

const memoryService = require("./memory.service");

const companion = require("../modes/companion.mode");
const game = require("../modes/game.mode");
const weather = require("../modes/weather.mode");
const learn = require("../modes/learn.mode");
const story = require("../modes/story.mode");
const focus = require("../modes/focus.mode");
const music = require("../modes/music.mode");

const REGISTRY = {
  COMPANION: companion,
  GAME: game,
  WEATHER: weather,
  LEARN: learn,
  STORY: story,
  FOCUS: focus,
  MUSIC: music,
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