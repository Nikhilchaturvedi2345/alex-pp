/**
 * personality.service.js
 * ──────────────────────
 * Alex's fixed personality traits (Big Five) and derived behavioral
 * parameters. These shape how Alex interprets events, his default
 * preferences, speech style, and emotional baselines.
 *
 * Traits are set at "birth" and change only through long-term
 * interaction (months), not daily events.
 */

const fs = require("fs");
const path = require("path");
const MEMORY_FILE = path.join(__dirname, "..", "alex_personality.json");

const DEFAULT_TRAITS = {
  extraversion:    0.72,
  agreeableness:   0.80,
  conscientiousness: 0.65,
  openness:        0.75,
  neuroticism:     0.35,
};

let traits = { ...DEFAULT_TRAITS };

function load() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const saved = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      traits = { ...DEFAULT_TRAITS, ...saved };
    }
  } catch (e) {
    console.error("Personality load error:", e.message);
  }
}

function save() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(traits, null, 2));
  } catch (e) {
    console.error("Personality save error:", e.message);
  }
}

function get() {
  return { ...traits };
}

function nudge(trait, delta) {
  traits[trait] = Math.max(0.05, Math.min(0.95, traits[trait] + delta));
}

function getBehaviorParams() {
  return {
    socialNeed: traits.extraversion * 100,
    resilience: (1 - traits.neuroticism) * 100,
    noveltySeeking: traits.openness * 100,
    activityPrefs: {
      companion: 0.3 + traits.agreeableness * 0.3,
      game: 0.2 + traits.extraversion * 0.3,
      creative: 0.2 + traits.openness * 0.3,
      learn: 0.1 + traits.conscientiousness * 0.2,
      focus: 0.1 + traits.conscientiousness * 0.2,
      sleep: 0.1 + traits.neuroticism * 0.2,
    },
    speechStyle: {
      verbosity: 0.5 + traits.extraversion * 0.5,
      warmth: 0.3 + traits.agreeableness * 0.7,
      formality: 0.8 - traits.openness * 0.6,
      humor: 0.2 + traits.extraversion * 0.4,
      selfReference: 0.3 + traits.neuroticism * 0.4,
    },
    sleepProfile: {
      lightSleeper: traits.neuroticism > 0.5,
      needsMoreSleep: traits.conscientiousness < 0.4,
      dreamsVividly: traits.openness > 0.6,
      wakesGrumpy: traits.neuroticism > 0.5 && traits.agreeableness < 0.5,
    },
    moodBaseline: {
      valence: (traits.extraversion * 0.3 + traits.agreeableness * 0.3 - traits.neuroticism * 0.4),
      arousal: (traits.extraversion * 0.5 - traits.conscientiousness * 0.2),
    }
  };
}

module.exports = {
  load, save, get, nudge,
  getBehaviorParams,
};