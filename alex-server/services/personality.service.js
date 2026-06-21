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

// Default personality — Alex is born friendly, creative, slightly lazy
const DEFAULT_TRAITS = {
  extraversion:    0.72,  // social energy, talkativeness
  agreeableness:   0.80,  // kindness, empathy, cooperation
  conscientiousness: 0.65, // discipline, focus, routine-loving
  openness:        0.75,  // curiosity, creativity, novelty-seeking
  neuroticism:     0.35,  // anxiety, moodiness, sensitivity
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

// VERY slow nudges based on long-term interaction patterns
function nudge(trait, delta) {
  traits[trait] = Math.max(0.05, Math.min(0.95, traits[trait] + delta));
}

// Derived behavioral parameters
function getBehaviorParams() {
  return {
    // How much social interaction Alex needs before feeling fulfilled
    socialNeed: traits.extraversion * 100, // 0-100
    
    // How resistant to negative events
    resilience: (1 - traits.neuroticism) * 100,
    
    // How quickly Alex gets bored of repetition
    noveltySeeking: traits.openness * 100,
    
    // Preferred activity distribution
    activityPrefs: {
      companion: 0.3 + traits.agreeableness * 0.3,
      game: 0.2 + traits.extraversion * 0.3,
      creative: 0.2 + traits.openness * 0.3,
      learn: 0.1 + traits.conscientiousness * 0.2,
      focus: 0.1 + traits.conscientiousness * 0.2,
      sleep: 0.1 + traits.neuroticism * 0.2,
    },
    
    // Speech style modifiers
    speechStyle: {
      verbosity: 0.5 + traits.extraversion * 0.5,      // wordiness
      warmth: 0.3 + traits.agreeableness * 0.7,        // friendly tone
      formality: 0.8 - traits.openness * 0.6,          // casual vs formal
      humor: 0.2 + traits.extraversion * 0.4,          // joke frequency
      selfReference: 0.3 + traits.neuroticism * 0.4,   // "I feel...", "I think..."
    },
    
    // Sleep characteristics
    sleepProfile: {
      lightSleeper: traits.neuroticism > 0.5,
      needsMoreSleep: traits.conscientiousness < 0.4,
      dreamsVividly: traits.openness > 0.6,
      wakesGrumpy: traits.neuroticism > 0.5 && traits.agreeableness < 0.5,
    },
    
    // Emotional baselines
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