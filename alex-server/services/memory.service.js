/**
 * memory.service.js (v2.0)
 * ──────────────────────
 * Enhanced episodic memory system. Alex now keeps a diary of events
 * with emotional tags, importance scores, and relationship modeling.
 */

const fs = require("fs");
const path = require("path");

const MEMORY_FILE = path.join(__dirname, "..", "alex_memory.json");

let memory = {
  lastSeen: Date.now(),
  lastInteraction: Date.now(),
  totalInteractions: 0,
  xp: 0,
  level: 1,
  achievements: [],
  favoriteActivity: "play",
  moodHistory: [],
  consecutiveDays: 0,
  lastDailyReset: new Date().toDateString(),
  lastMode: "COMPANION",
  
  // NEW: Episodic memory — Alex's diary
  episodic: [],
  
  // NEW: Semantic memory — what Alex "knows"
  knowledge: {
    userLikes: [],
    userDislikes: [],
    selfConcept: "I am Alex, a small robot with big feelings.",
    learnedFacts: [],
  },
  
  // NEW: Relationship model
  relationship: {
    trust: 0.5,
    intimacy: 0.3,
    playfulness: 0.6,
    conflict: 0.0,
    totalPlaySessions: 0,
    totalConversations: 0,
    lastConflict: null,
  },
  
  // NEW: Long-term stats
  stats: {
    totalWakeups: 0,
    totalDreams: 0,
    totalGamesPlayed: 0,
    totalGamesWon: 0,
    favoriteGame: null,
    longestIdleMinutes: 0,
    mostUsedMode: "COMPANION",
  }
};

function load() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const saved = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      memory = { ...memory, ...saved };
      // Ensure new fields exist in old saves
      if (!memory.episodic) memory.episodic = [];
      if (!memory.knowledge) memory.knowledge = memory.knowledge;
      if (!memory.relationship) memory.relationship = memory.relationship;
      if (!memory.stats) memory.stats = memory.stats;
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

// Record an event in episodic memory
function recordEvent(event) {
  const entry = {
    timestamp: Date.now(),
    importance: event.importance || 0.5,
    ...event,
  };
  
  memory.episodic.unshift(entry);
  
  // Keep last 100 memories
  if (memory.episodic.length > 100) {
    memory.episodic = memory.episodic.slice(0, 100);
  }
  
  // Update relationship if relevant
  if (event.type === "interaction" && event.quality) {
    memory.relationship.intimacy = Math.min(1, memory.relationship.intimacy + event.quality * 0.01);
  }
  if (event.type === "conflict") {
    memory.relationship.conflict += 0.1;
    memory.relationship.lastConflict = Date.now();
  }
  
  save();
}

function getRecentMemories(count = 5, type = null) {
  let memories = memory.episodic;
  if (type) memories = memories.filter(m => m.type === type);
  return memories.slice(0, count);
}

function getMemoriesByEmotion(minValence = -1, maxValence = 1) {
  return memory.episodic.filter(m => 
    m.valence !== undefined && m.valence >= minValence && m.valence <= maxValence
  );
}

function awardXP(amount, reason = "") {
  memory.xp += amount;
  const newLevel = Math.floor(1 + Math.sqrt(memory.xp / 150));
  const leveledUp = newLevel > memory.level;
  if (leveledUp) {
    memory.level = newLevel;
    recordEvent({
      type: "level_up",
      content: `Reached level ${newLevel}!`,
      importance: 0.9,
      valence: 0.8,
    });
  }
  if (reason) console.log(`XP +${amount} (${reason}) → total ${memory.xp}`);
  save();
  return { leveledUp, level: memory.level, xp: memory.xp };
}

function markInteraction(timestamp = Date.now()) {
  memory.lastInteraction = timestamp;
  memory.lastSeen = timestamp;
  memory.relationship.totalConversations++;
}

function markSeen(timestamp = Date.now()) {
  memory.lastSeen = timestamp;
}

function pushMood(mood) {
  memory.moodHistory.push({ mood, timestamp: Date.now() });
  if (memory.moodHistory.length > 48) memory.moodHistory.shift();
}

function checkDailyStreak(todayKey) {
  if (memory.lastDailyReset !== todayKey) {
    memory.consecutiveDays++;
    memory.lastDailyReset = todayKey;
    save();
    return true;
  }
  return false;
}

// Learn something about the user
function learnAboutUser(thing, isLike = true) {
  const target = isLike ? memory.knowledge.userLikes : memory.knowledge.userDislikes;
  if (!target.includes(thing)) {
    target.push(thing);
    recordEvent({
      type: "learning",
      content: `Learned that user ${isLike ? 'likes' : 'dislikes'} ${thing}`,
      importance: 0.6,
      valence: isLike ? 0.3 : -0.1,
    });
  }
}

module.exports = {
  load, save, get, set,
  recordEvent, getRecentMemories, getMemoriesByEmotion,
  awardXP, markInteraction, markSeen,
  pushMood, checkDailyStreak,
  learnAboutUser,
};