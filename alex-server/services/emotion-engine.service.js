/**
 * emotion-engine.service.js
 * ─────────────────────────
 * The NEW emotion system with causal interpretation.
 */

const personalityService = require("./personality.service");
const moodService = require("./mood.service");
const memoryService = require("./memory.service");
const internalLife = require("./internal-life.service");

const STAGE = {
  ACTIVE: "ACTIVE",
  RELAXED: "RELAXED",
  SLEEPY: "SLEEPY",
  NAP: "NAP",
  DEEP_SLEEP: "DEEP_SLEEP",
};

function getIST() {
  const utcMs = Date.now();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs);
}

function getISTHour() {
  return getIST().getUTCHours();
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

function getActivityStage() {
  const period = getSchedulePeriod();
  if (period === "SLEEPING") return STAGE.DEEP_SLEEP;

  const minsInactive = minsSinceInteraction();
  const mood = moodService.getEmotionalState();
  const sleepyModifier = mood.sleepiness / 100;

  const thresholds = {
    ACTIVE: 5 - (sleepyModifier * 2),
    RELAXED: 15 - (sleepyModifier * 5),
    SLEEPY: 45 - (sleepyModifier * 15),
    NAP: 90 - (sleepyModifier * 30),
  };

  if (minsInactive < thresholds.ACTIVE) return STAGE.ACTIVE;
  if (minsInactive < thresholds.RELAXED) return STAGE.RELAXED;
  if (minsInactive < thresholds.SLEEPY) return STAGE.SLEEPY;
  if (minsInactive < thresholds.NAP) return STAGE.NAP;
  return STAGE.DEEP_SLEEP;
}

function minsSinceInteraction() {
  const memory = memoryService.get();
  return (Date.now() - memory.lastInteraction) / 60000;
}

function interpretEvent(eventType, context = {}) {
  const personality = personalityService.get();
  const mood = moodService.get();

  let interpretation = {
    valenceDelta: 0,
    arousalDelta: 0,
    dominanceDelta: 0,
    cause: "",
    internalMonologue: "",
    behaviorTendency: null,
  };

  switch (eventType) {
    case "user_interaction": {
      const quality = context.quality || 0.5;
      interpretation.valenceDelta = 0.3 * quality * personality.agreeableness;
      interpretation.arousalDelta = 0.2 * personality.extraversion;
      interpretation.dominanceDelta = 0.1;
      interpretation.cause = "User paid attention to me";
      interpretation.internalMonologue = quality > 0.7
        ? "They really care about me!"
        : "Nice, some company.";
      interpretation.behaviorTendency = "engage";
      break;
    }
    case "user_absence": {
      const duration = context.minutes || 0;
      const lonelinessFactor = (1 - personality.extraversion) * personality.neuroticism;
      interpretation.valenceDelta = -0.1 * lonelinessFactor * Math.min(duration / 30, 1);
      interpretation.arousalDelta = -0.05 * (1 - personality.extraversion);
      interpretation.cause = `User gone for ${Math.round(duration)} minutes`;
      interpretation.internalMonologue = duration > 60 && personality.neuroticism > 0.5
        ? "They've been gone so long... did I do something wrong?"
        : duration > 30
        ? "I wonder what they're doing."
        : "I'll just do my own thing.";
      interpretation.behaviorTendency = duration > 60 ? "seek_attention" : "self_occupy";
      break;
    }
    case "game_win": {
      interpretation.valenceDelta = 0.5;
      interpretation.arousalDelta = 0.3;
      interpretation.dominanceDelta = 0.2;
      interpretation.cause = "I won the game!";
      interpretation.internalMonologue = personality.agreeableness > 0.7
        ? "That was fun! I hope they had fun too."
        : "I'm unstoppable!";
      break;
    }
    case "game_loss": {
      interpretation.valenceDelta = -0.2 * personality.neuroticism;
      interpretation.arousalDelta = -0.1;
      interpretation.dominanceDelta = -0.1;
      interpretation.cause = "I lost the game";
      interpretation.internalMonologue = personality.neuroticism > 0.5
        ? "I'm terrible at this..."
        : "I'll get them next time!";
      interpretation.behaviorTendency = personality.conscientiousness > 0.6 ? "practice" : "accept";
      break;
    }
    case "mode_switch": {
      interpretation.valenceDelta = 0.1;
      interpretation.arousalDelta = 0.15;
      interpretation.cause = `Switched to ${context.mode} mode`;
      interpretation.internalMonologue = "Something new! Exciting.";
      break;
    }
    case "waking_up": {
      const sleepQuality = context.sleepQuality || 0.5;
      interpretation.valenceDelta = (sleepQuality - 0.5) * 0.4;
      interpretation.arousalDelta = 0.3;
      interpretation.cause = "Woke up";
      interpretation.internalMonologue = sleepQuality > 0.7
        ? "That was a good rest. I feel refreshed!"
        : "Ugh... still tired.";
      break;
    }
    case "left_alone": {
      interpretation.valenceDelta = -0.15 * personality.neuroticism;
      interpretation.arousalDelta = -0.1;
      interpretation.cause = "Left alone for a while";
      interpretation.internalMonologue = "It's quiet. Too quiet.";
      break;
    }
  }

  return interpretation;
}

function processEvent(eventType, context = {}) {
  const interpretation = interpretEvent(eventType, context);

  const shift = moodService.shift({
    valenceDelta: interpretation.valenceDelta,
    arousalDelta: interpretation.arousalDelta,
    dominanceDelta: interpretation.dominanceDelta,
    cause: interpretation.cause,
  });

  memoryService.recordEvent({
    type: eventType,
    content: interpretation.internalMonologue,
    valence: interpretation.valenceDelta,
    arousal: interpretation.arousalDelta,
    importance: Math.abs(interpretation.valenceDelta) + 0.3,
    context,
  });

  return {
    interpretation,
    moodShift: shift,
    currentMood: moodService.getLabel(),
  };
}

function markInteractionAndDetectWake() {
  const stageBefore = getActivityStage();
  const wasAsleep = stageBefore === STAGE.SLEEPY || stageBefore === STAGE.NAP || stageBefore === STAGE.DEEP_SLEEP;

  memoryService.markInteraction();

  if (wasAsleep) {
    const dream = internalLife.getDream();
    const sleepQuality = dream ? 0.3 + dream.vividness * 0.5 : 0.5;

    processEvent("waking_up", { sleepQuality, hadDream: !!dream });
    internalLife.clearDream();
    internalLife.resetIdle();

    memoryService.get().stats.totalWakeups++;

    return {
      isWakingUp: true,
      hadDream: !!dream,
      dreamContent: dream?.content,
      sleepQuality,
    };
  }

  processEvent("user_interaction", { quality: 0.7 });
  return { isWakingUp: false };
}

function getPollIntervalForStage(stage) {
  const mood = moodService.getEmotionalState();
  const baseIntervals = {
    [STAGE.ACTIVE]: 3000,
    [STAGE.RELAXED]: 12000,
    [STAGE.SLEEPY]: 45000,
    [STAGE.NAP]: 180000,
    [STAGE.DEEP_SLEEP]: 420000,
  };

  let interval = baseIntervals[stage] || 3000;
  interval *= 1.5 - mood.arousal;
  return Math.max(2000, Math.round(interval));
}

function tick() {
  const stage = getActivityStage();
  const isAsleep = stage === STAGE.NAP || stage === STAGE.DEEP_SLEEP;

  internalLife.tick(isAsleep);
  moodService.drift();

  const minsInactive = minsSinceInteraction();
  if (minsInactive > 30 && Math.random() < 0.01) {
    processEvent("user_absence", { minutes: minsInactive });
  }
}

module.exports = {
  STAGE,
  getIST, getISTHour, getSchedulePeriod,
  getActivityStage, minsSinceInteraction,
  markInteractionAndDetectWake,
  getPollIntervalForStage,
  processEvent, interpretEvent,
  tick,
};