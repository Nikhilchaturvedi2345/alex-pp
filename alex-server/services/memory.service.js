/**
 * memory.service.js
 * ──────────────────
 * Owns Alex's persisted state: XP, level, streaks, last-seen /
 * last-interaction timestamps, mood history, achievements.
 *
 * Nothing in here knows about HTTP, modes, or faces — it's pure
 * state + persistence. Other services (emotion, mode) and route
 * handlers read/write through the exported functions below instead
 * of touching the file system directly.
 */

const fs = require("fs");
const path = require("path");

const MEMORY_FILE = path.join(__dirname, "..", "alex_memory.json");

let memory = {
  lastSeen: Date.now(), // last ESP poll (connectivity, not "activity")
  lastInteraction: Date.now(), // last REAL user action — drives sleep stages
  totalInteractions: 0,
  xp: 0,
  level: 1,
  achievements: [],
  favoriteActivity: "play",
  moodHistory: [],
  consecutiveDays: 0,
  lastDailyReset: new Date().toDateString(),
  // Phase 1 addition — persists across restarts so Alex doesn't
  // forget what mode it was in.
  lastMode: "COMPANION",
};

function load() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const saved = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      memory = { ...memory, ...saved };
    }
  } catch (e) {
    console.error("Memory load error:", e.message);
  }
  return memory;
}

function save() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  } catch (e) {
    console.error("Memory save error:", e.message);
  }
}

function get() {
  return memory;
}

function set(partial) {
  memory = { ...memory, ...partial };
  return memory;
}

function awardXP(amount, reason = "") {
  memory.xp += amount;
  const newLevel = Math.floor(1 + Math.sqrt(memory.xp / 150));
  const leveledUp = newLevel > memory.level;
  if (leveledUp) memory.level = newLevel;
  if (reason) console.log(`XP +${amount} (${reason}) → total ${memory.xp}`);
  save();
  return { leveledUp, level: memory.level, xp: memory.xp };
}

function markInteraction(timestamp = Date.now()) {
  memory.lastInteraction = timestamp;
  memory.lastSeen = timestamp;
}

function markSeen(timestamp = Date.now()) {
  memory.lastSeen = timestamp;
}

function pushMood(mood) {
  memory.moodHistory.push(mood);
  if (memory.moodHistory.length > 24) memory.moodHistory.shift();
}

function checkDailyStreak(todayKey) {
  if (memory.lastDailyReset !== todayKey) {
    memory.consecutiveDays++;
    memory.lastDailyReset = todayKey;
    save();
    return true; // streak incremented
  }
  return false;
}

module.exports = {
  load,
  save,
  get,
  set,
  awardXP,
  markInteraction,
  markSeen,
  pushMood,
  checkDailyStreak,
};
