/**
 * mood.service.js
 * ───────────────
 * Alex's persistent mood state — a slow-moving emotional "weather"
 * that persists between interactions and influences all behavior.
 *
 * Unlike reactive emotions (which spike and fade), mood is Alex's
 * current emotional climate. It takes significant events to shift.
 */

const personalityService = require("./personality.service");
const memoryService = require("./memory.service");

// Mood state
let mood = {
  valence: 0.0,      // -1 (miserable) to +1 (ecstatic)
  arousal: 0.0,      // -1 (lethargic) to +1 (hyper)
  dominance: 0.0,    // -1 (submissive) to +1 (dominant) — how "in control" Alex feels
  stability: 0.85,   // resistance to change (derived from personality)
  lastShift: Date.now(),
  cause: "Just woke up", // Alex can tell you WHY he feels this way
  intensity: 0.3,  // how strongly the mood is felt
};

const MOOD_LABELS = [
  // valence+, arousal+, dominance+
  { name: "exuberant", valence: [0.3, 1], arousal: [0.3, 1], dominance: [0, 1] },
  { name: "excited", valence: [0.3, 1], arousal: [0.3, 1], dominance: [-0.3, 0] },
  { name: "happy", valence: [0.3, 1], arousal: [-0.3, 0.3], dominance: [0, 1] },
  { name: "content", valence: [0.3, 1], arousal: [-0.3, 0.3], dominance: [-0.3, 0] },
  { name: "proud", valence: [0.3, 1], arousal: [0, 0.3], dominance: [0.3, 1] },
  
  // valence+, arousal-
  { name: "relaxed", valence: [0, 0.3], arousal: [-0.3, 0], dominance: [0, 1] },
  { name: "calm", valence: [0, 0.3], arousal: [-0.3, 0], dominance: [-0.3, 0] },
  { name: "sleepy", valence: [0, 0.3], arousal: [-1, -0.3], dominance: [-0.3, 0.3] },
  
  // valence-, arousal+
  { name: "angry", valence: [-1, -0.3], arousal: [0.3, 1], dominance: [0.3, 1] },
  { name: "anxious", valence: [-1, -0.3], arousal: [0.3, 1], dominance: [-1, -0.3] },
  { name: "frustrated", valence: [-1, -0.3], arousal: [0, 0.3], dominance: [0, 0.3] },
  
  // valence-, arousal-
  { name: "sad", valence: [-1, -0.3], arousal: [-0.3, 0], dominance: [-0.3, 0.3] },
  { name: "depressed", valence: [-1, -0.3], arousal: [-1, -0.3], dominance: [-1, -0.3] },
  { name: "lonely", valence: [-1, -0.3], arousal: [-0.3, 0.3], dominance: [-0.3, 0] },
  { name: "bored", valence: [-0.3, 0], arousal: [-0.3, 0.3], dominance: [-0.3, 0.3] },
  
  // neutral
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

// Shift mood based on an event's emotional impact
// impact: { valenceDelta, arousalDelta, dominanceDelta, cause }
function shift(impact) {
  const prevLabel = getLabel();
  
  // Apply deltas, dampened by stability
  const damping = 1 - mood.stability * 0.7; // high stability = less change
  mood.valence += impact.valenceDelta * damping;
  mood.arousal += impact.arousalDelta * damping;
  mood.dominance += (impact.dominanceDelta || 0) * damping;
  
  // Clamp
  mood.valence = Math.max(-1, Math.min(1, mood.valence));
  mood.arousal = Math.max(-1, Math.min(1, mood.arousal));
  mood.dominance = Math.max(-1, Math.min(1, mood.dominance));
  
  const newLabel = getLabel();
  if (newLabel !== prevLabel) {
    mood.lastShift = Date.now();
    mood.cause = impact.cause || "Something changed";
    mood.intensity = Math.abs(mood.valence) + Math.abs(mood.arousal) * 0.5;
    
    // Record mood shift in episodic memory
    memoryService.recordEvent({
      type: "mood_shift",
      from: prevLabel,
      to: newLabel,
      cause: mood.cause,
      valence: mood.valence,
    });
  }
  
  return { from: prevLabel, to: newLabel, cause: mood.cause };
}

// Slow drift toward personality baseline over time
function drift() {
  const params = personalityService.getBehaviorParams();
  const baseline = params.moodBaseline;
  const driftRate = 0.002; // very slow
  
  mood.valence += (baseline.valence - mood.valence) * driftRate;
  mood.arousal += (baseline.arousal - mood.arousal) * driftRate;
  mood.dominance *= (1 - driftRate * 0.5); // dominance naturally decays to neutral
}

// Get emotional "temperature" for behavior decisions
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