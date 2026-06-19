/**
 * emotion.service.js
 * ───────────────────
 * Owns Alex's emotion vector (happiness, curiosity, energy, etc.),
 * the schedule/activity-stage logic that feeds it, and the
 * dominant-emotion calculation. This is the same engine from
 * Alex Brain v2.1 — moved out of the monolith, behavior unchanged.
 */

const memoryService = require("./memory.service");

// ── Time — IST ─────────────────────────────────────────────────
function getIST() {
  const utcMs = Date.now();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs);
}
function getISTHour() {
  return getIST().getUTCHours();
}
function getISTMinutes() {
  return getIST().getUTCMinutes();
}

function getSchedulePeriod() {
  const h = getISTHour();
  if (h >= 23 || h < 5) return "SLEEPING";
  if (h >= 5 && h < 7) return "EARLY_MORNING";
  if (h >= 7 && h < 9) return "WAKING_UP";
  if (h >= 9 && h < 10) return "BREAKFAST";
  if (h >= 10 && h < 12) return "STUDY";
  if (h >= 12 && h < 14) return "LUNCH";
  if (h >= 14 && h < 17) return "PLAY";
  if (h >= 17 && h < 19) return "CREATIVE";
  if (h >= 19 && h < 21) return "EVENING";
  if (h >= 21 && h < 23) return "WIND_DOWN";
  return "IDLE";
}

// ── Lazy Companion / Sleep stages ────────────────────────────────
const STAGE = {
  ACTIVE: "ACTIVE",
  RELAXED: "RELAXED",
  SLEEPY: "SLEEPY",
  NAP: "NAP",
  DEEP_SLEEP: "DEEP_SLEEP",
};

function minsSinceInteraction() {
  const memory = memoryService.get();
  return (Date.now() - memory.lastInteraction) / 60000;
}

function getActivityStage() {
  // Nighttime schedule always wins — Alex is properly asleep at night.
  if (getSchedulePeriod() === "SLEEPING") return STAGE.DEEP_SLEEP;

  const m = minsSinceInteraction();
  if (m < 5) return STAGE.ACTIVE;
  if (m < 15) return STAGE.RELAXED;
  if (m < 45) return STAGE.SLEEPY;
  if (m < 90) return STAGE.NAP;
  return STAGE.DEEP_SLEEP;
}

// Tracks whether Alex was asleep on the previous check, so we can
// detect the exact moment of waking up and fire a greeting/dream.
let wasAsleep = false;

function setWasAsleep(v) {
  wasAsleep = v;
}

function markInteractionAndDetectWake() {
  const stageBefore = getActivityStage();
  const isWakingUp =
    wasAsleep ||
    stageBefore === STAGE.SLEEPY ||
    stageBefore === STAGE.NAP ||
    stageBefore === STAGE.DEEP_SLEEP;

  memoryService.markInteraction();
  wasAsleep = false;

  return isWakingUp;
}

// Poll interval per stage — server decides, ESP just obeys.
function getPollIntervalForStage(stage) {
  switch (stage) {
    case STAGE.ACTIVE:
      return randInt(2000, 5000);
    case STAGE.RELAXED:
      return randInt(10000, 20000);
    case STAGE.SLEEPY:
      return randInt(30000, 60000);
    case STAGE.NAP:
      return randInt(120000, 300000);
    case STAGE.DEEP_SLEEP:
      return randInt(300000, 600000);
    default:
      return 3000;
  }
}

// ── Emotion vector ────────────────────────────────────────────────
const emo = {
  happiness: 65,
  curiosity: 50,
  energy: 70,
  boredom: 10,
  excitement: 40,
  sleepiness: 15,
  confidence: 60,
};
const EMO_BASELINES = {
  happiness: 60,
  curiosity: 50,
  energy: 65,
  boredom: 15,
  excitement: 40,
  sleepiness: 20,
  confidence: 60,
};

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}
function nudge(key, delta) {
  emo[key] = clamp(emo[key] + delta);
}

function tick() {
  const period = getSchedulePeriod();
  const h = getISTHour();
  const stage = getActivityStage();

  const isNight = h >= 22 || h < 6;
  const isMorning = h >= 7 && h < 11;

  if (isNight) {
    nudge("sleepiness", +0.9);
    nudge("energy", -0.5);
    nudge("excitement", -0.3);
  } else if (isMorning) {
    nudge("sleepiness", -0.7);
    nudge("energy", +0.5);
  }

  if (stage === STAGE.RELAXED) {
    nudge("boredom", +0.3);
    nudge("energy", -0.1);
  }
  if (stage === STAGE.SLEEPY) {
    nudge("sleepiness", +0.6);
    nudge("energy", -0.3);
  }
  if (stage === STAGE.NAP) {
    nudge("sleepiness", +0.9);
    nudge("energy", -0.5);
  }
  if (stage === STAGE.DEEP_SLEEP) {
    nudge("sleepiness", +1.2);
    nudge("energy", -0.6);
  }

  const PFX = {
    SLEEPING: { sleepiness: +1.0, energy: -0.4 },
    EARLY_MORNING: { sleepiness: +0.6, curiosity: +0.2 },
    WAKING_UP: { sleepiness: -0.6, energy: +0.4 },
    BREAKFAST: { happiness: +0.5, energy: +0.4 },
    STUDY: { curiosity: +0.6, boredom: -0.2 },
    LUNCH: { happiness: +0.4, energy: +0.3 },
    PLAY: { excitement: +0.7, boredom: -0.6, happiness: +0.3 },
    CREATIVE: { curiosity: +0.5, happiness: +0.3, confidence: +0.2 },
    EVENING: { happiness: +0.2, energy: -0.2 },
    WIND_DOWN: { sleepiness: +0.5, energy: -0.4 },
  };
  const fx = PFX[period] || {};
  for (const [k, v] of Object.entries(fx)) nudge(k, v);

  for (const [k, base] of Object.entries(EMO_BASELINES)) {
    emo[k] = clamp(emo[k] + (base - emo[k]) * 0.015);
  }

  if (Date.now() % (5 * 60 * 1000) < 1100) {
    memoryService.pushMood(getDominantEmotion());
  }
}

function getDominantEmotion() {
  const scored = { ...emo, sleepiness: emo.sleepiness * 1.3 };
  return Object.entries(scored).sort((a, b) => b[1] - a[1])[0][0];
}

function getEmotions() {
  return emo;
}

function rand() {
  return Math.random();
}
function randInt(lo, hi) {
  return Math.floor(rand() * (hi - lo + 1)) + lo;
}

module.exports = {
  STAGE,
  getIST,
  getISTHour,
  getISTMinutes,
  getSchedulePeriod,
  getActivityStage,
  minsSinceInteraction,
  setWasAsleep,
  markInteractionAndDetectWake,
  getPollIntervalForStage,
  tick,
  nudge,
  getDominantEmotion,
  getEmotions,
  clamp,
};
