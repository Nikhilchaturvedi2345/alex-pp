/**
 * mood.service.js
 * ───────────────
 * Alex's persistent mood state — a slow-moving emotional "weather"
 * that persists between interactions and influences all behavior.
 */

const personalityService = require("./personality.service");

let mood = {
  valence: 0.0,
  arousal: 0.0,
  dominance: 0.0,
  stability: 0.85,
  lastShift: Date.now(),
  cause: "Just woke up",
  intensity: 0.3,
};

const MOOD_LABELS = [
  { name: "exuberant", valence: [0.3, 1], arousal: [0.3, 1], dominance: [0, 1] },
  { name: "excited", valence: [0.3, 1], arousal: [0.3, 1], dominance: [-0.3, 0] },
  { name: "happy", valence: [0.3, 1], arousal: [-0.3, 0.3], dominance: [0, 1] },
  { name: "content", valence: [0.3, 1], arousal: [-0.3, 0.3], dominance: [-0.3, 0] },
  { name: "proud", valence: [0.3, 1], arousal: [0, 0.3], dominance: [0.3, 1] },
  { name: "relaxed", valence: [0, 0.3], arousal: [-0.3, 0], dominance: [0, 1] },
  { name: "calm", valence: [0, 0.3], arousal: [-0.3, 0], dominance: [-0.3, 0] },
  { name: "sleepy", valence: [0, 0.3], arousal: [-1, -0.3], dominance: [-0.3, 0.3] },
  { name: "angry", valence: [-1, -0.3], arousal: [0.3, 1], dominance: [0.3, 1] },
  { name: "anxious", valence: [-1, -0.3], arousal: [0.3, 1], dominance: [-1, -0.3] },
  { name: "frustrated", valence: [-1, -0.3], arousal: [0, 0.3], dominance: [0, 0.3] },
  { name: "sad", valence: [-1, -0.3], arousal: [-0.3, 0], dominance: [-0.3, 0.3] },
  { name: "depressed", valence: [-1, -0.3], arousal: [-1, -0.3], dominance: [-1, -0.3] },
  { name: "lonely", valence: [-1, -0.3], arousal: [-0.3, 0.3], dominance: [-0.3, 0] },
  { name: "bored", valence: [-0.3, 0], arousal: [-0.3, 0.3], dominance: [-0.3, 0.3] },
  { name: "neutral", valence: [-0.1, 0.1], arousal: [-0.1, 0.1], dominance: [-0.1, 0.1] },
];

function init() {
  const params = personalityService.getBehaviorParams();
  const baseline = params.moodBaseline;
  mood.valence = baseline.valence;
  mood.arousal = baseline.arousal;
  mood.stability = 0.6 + (1 - personalityService.get().neuroticism) * 0.35;
}

function get() {
  return { ...mood };
}

function getLabel() {
  const m = mood;
  for (const label of MOOD_LABELS) {
    if (m.valence >= label.valence[0] && m.valence <= label.valence[1] &&
        m.arousal >= label.arousal[0] && m.arousal <= label.arousal[1] &&
        m.dominance >= label.dominance[0] && m.dominance <= label.dominance[1]) {
      return label.name;
    }
  }
  return "neutral";
}

function shift(impact) {
  const prevLabel = getLabel();
  const damping = 1 - mood.stability * 0.7;

  mood.valence += impact.valenceDelta * damping;
  mood.arousal += impact.arousalDelta * damping;
  mood.dominance += (impact.dominanceDelta || 0) * damping;

  mood.valence = Math.max(-1, Math.min(1, mood.valence));
  mood.arousal = Math.max(-1, Math.min(1, mood.arousal));
  mood.dominance = Math.max(-1, Math.min(1, mood.dominance));

  const newLabel = getLabel();
  if (newLabel !== prevLabel) {
    mood.lastShift = Date.now();
    mood.cause = impact.cause || "Something changed";
    mood.intensity = Math.abs(mood.valence) + Math.abs(mood.arousal) * 0.5;
  }

  return { from: prevLabel, to: newLabel, cause: mood.cause };
}

function drift() {
  const params = personalityService.getBehaviorParams();
  const baseline = params.moodBaseline;
  const driftRate = 0.002;

  mood.valence += (baseline.valence - mood.valence) * driftRate;
  mood.arousal += (baseline.arousal - mood.arousal) * driftRate;
  mood.dominance *= (1 - driftRate * 0.5);
}

function getEmotionalState() {
  const label = getLabel();
  return {
    ...mood,
    label,
    isPositive: mood.valence > 0.1,
    isNegative: mood.valence < -0.1,
    isHighEnergy: mood.arousal > 0.2,
    isLowEnergy: mood.arousal < -0.2,
    isDominant: mood.dominance > 0.2,
    isSubmissive: mood.dominance < -0.2,
    sleepiness: Math.max(0, (-mood.arousal + 0.5) * 50 + (mood.valence < 0 ? 10 : 0)),
  };
}

module.exports = {
  init, get, getLabel, shift, drift, getEmotionalState,
};