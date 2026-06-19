/**
 * companion.mode.js
 * ──────────────────
 * Default mode. This is the existing lazy-companion / sleep-system
 * behavior (emotion-driven face, ambient dialogue, sleep stages) —
 * unchanged, just now addressable through the mode framework.
 *
 * Phase 1 scope: framework only. The actual face/dialogue logic
 * still lives in faceEngine / dialogue services and is rendered
 * regardless of mode for now; this descriptor exists so /mode and
 * /ui can address COMPANION like any other mode.
 */

module.exports = {
  id: "COMPANION",
  label: "Companion",
  ackLine: "Companion mode.",

  onEnter() {
    // No-op for now — companion behavior is always-on (emotion +
    // sleep system). Future phases could use this to resume ambient
    // dialogue immediately on switch-back.
  },

  onExit() {
    // No-op for now.
  },
};
