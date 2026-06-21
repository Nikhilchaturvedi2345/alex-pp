/**
 * emotion-engine.service.js
 * ─────────────────────────
 * The NEW emotion system. Instead of a simple vector drifting toward
 * baselines, this engine:
 *
 * 1. INTERPRETS events through personality + mood
 * 2. GENERATES emotional responses with causal attribution
 * 3. MAINTAINS persistent mood that shapes all behavior
 * 4. PRODUCES internal monologue (Alex knows WHY he feels things)
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

// Time-based schedule (unchanged)
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

// Activity stage based on inactivity — BUT now also influenced by mood
function getActivityStage() {
  const period = getSchedulePeriod();
  if (period === "SLEEPING") return STAGE.DEEP_SLEEP;
  
  const minsInactive = minsSinceInteraction();
  const mood = moodService.getEmotionalState();
  
  // Mood modifies thresholds — a sleepy mood makes Alex tired faster
  const sleepyModifier = mood.sleepiness / 100; // 0-1
  
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

// Event interpretation — the "Why" engine
function interpretEvent(eventType, context = {}) {
  const personality = personalityService.get();
  const mood = moodService.get();
  const params = personalityService.getBehaviorParams();
  
  let interpretation = {
    valenceDelta: 0,
    arousalDelta: 0,
    dominanceDelta: 0,
    cause: "",
    internalMonologue: "",
    behaviorTendency: null,
  };
  
  switch (eventType) {
    case "user_interaction":
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
      
    case "user_absence":
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
      
    case "game_win":
      interpretation.valenceDelta = 0.5;
      interpretation.arousalDelta = 0.3;
      interpretation.dominanceDelta = 0.2;
      interpretation.cause = "I won the game!";
      interpretation.internalMonologue = personality.agreeableness > 0.7
        ? "That was fun! I hope they had fun too."
        : "I'm unstoppable!";
      break;
      
    case "game_loss":
      interpretation.valenceDelta = -0.2 * personality.neuroticism;
      interpretation.arousalDelta = -0.1;
      interpretation.dominanceDelta = -0.1;
      interpretation.cause = "I lost the game";
      interpretation.internalMonologue = personality.neuroticism > 0.5
        ? "I'm terrible at this..."
        : "I'll get them next time!";
      interpretation.behaviorTendency = personality.conscientiousness > 0.6 ? "practice" : "accept";
      break;
      
    case "mode_switch":
      interpretation.valenceDelta = 0.1;
      interpretation.arousalDelta = 0.15;
      interpretation.cause = `Switched to ${context.mode} mode`;
      interpretation.internalMonologue = "Something new! Exciting.";
      break;
      
    case "waking_up":
      const sleepQuality = context.sleepQuality || 0.5;
      interpretation.valenceDelta = (sleepQuality - 0.5) * 0.4;
      interpretation.arousalDelta = 0.3;
      interpretation.cause = "Woke up";
      interpretation.internalMonologue = sleepQuality > 0.7
        ? "That was a good rest. I feel refreshed!"
        : "Ugh... still tired.";
      break;
      
    case "left_alone":
      interpretation.valenceDelta = -0.15 * personality.neuroticism;
      interpretation.arousalDelta = -0.1;
      interpretation.cause = "Left alone for a while";
      interpretation.internalMonologue = "It's quiet. Too quiet.";
      break;
  }
  
  return interpretation;
}

// Apply an event to Alex's emotional state
function processEvent(eventType, context = {}) {
  const interpretation = interpretEvent(eventType, context);
  
  // Shift mood
  const shift = moodService.shift({
    valenceDelta: interpretation.valenceDelta,
    arousalDelta: interpretation.arousalDelta,
    dominanceDelta: interpretation.dominanceDelta,
    cause: interpretation.cause,
  });
  
  // Record in episodic memory
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

// Poll intervals based on stage AND mood
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
  
  // High arousal = faster polling (Alex is alert)
  // Low arousal = slower polling (Alex is sluggish)
  interval *= 1.5 - mood.arousal; // 0.5x to 2.5x modifier
  
  return Math.max(2000, Math.round(interval));
}

// Generate face based on mood + internal state + stage (not just stage!)
function generateFaceState() {
  const stage = getActivityStage();
  const mood = moodService.getEmotionalState();
  const internal = internalLife.getState();
  
  // Sleep stages override everything
  if (stage === STAGE.DEEP_SLEEP) {
    return {
      el: 7, er: 7, ec: 0x39c7, eb: 0, m: 0, bl: false, zzz: true,
      narrative: "Deep sleep...",
    };
  }
  
  if (stage === STAGE.NAP) {
    const dreaming = !!internal.dreamState;
    return {
      el: 7, er: 7, ec: 0x10a2, eb: 0, m: 0, bl: false, zzz: true,
      narrative: dreaming ? `Dreaming: ${internal.dreamState.content}` : "Napping peacefully...",
    };
  }
  
  // Mood-driven face selection
  const moodFace = getMoodFace(mood);
  
  // Blend with activity stage
  if (stage === STAGE.SLEEPY) {
    return {
      ...moodFace,
      el: 3, er: 3, // squint
      ec: dimColor(moodFace.ec),
      narrative: moodFace.narrative + " (getting sleepy...)",
    };
  }
  
  if (stage === STAGE.RELAXED) {
    return {
      ...moodFace,
      bl: false,
      narrative: moodFace.narrative + " (relaxing)",
    };
  }
  
  // Active — full expression
  return {
    ...moodFace,
    narrative: moodFace.narrative,
  };
}

function getMoodFace(mood) {
  const label = mood.label;
  
  const FACES = {
    happy: { el: 1, er: 1, ec: 0x07e0, eb: 1, m: 1, bl: true, zzz: false, narrative: "Feeling happy!" },
    excited: { el: 2, er: 2, ec: 0xffe0, eb: 1, m: 6, bl: false, zzz: false, narrative: "So excited!" },
    content: { el: 1, er: 1, ec: 0x07e0, eb: 0, m: 1, bl: true, zzz: false, narrative: "Content." },
    relaxed: { el: 1, er: 1, ec: 0x0410, eb: 0, m: 0, bl: false, zzz: false, narrative: "Relaxed." },
    curious: { el: 2, er: 1, ec: 0x07ff, eb: 1, m: 5, bl: false, zzz: false, narrative: "Curious..." },
    bored: { el: 3, er: 3, ec: 0x39c7, eb: 0, m: 0, bl: false, zzz: false, narrative: "Bored..." },
    sad: { el: 7, er: 7, ec: 0x001f, eb: 3, m: 2, bl: false, zzz: false, narrative: "Feeling sad." },
    lonely: { el: 7, er: 7, ec: 0x10a2, eb: 3, m: 2, bl: false, zzz: false, narrative: "Lonely..." },
    angry: { el: 8, er: 8, ec: 0xf800, eb: 2, m: 2, bl: false, zzz: false, narrative: "Angry!" },
    anxious: { el: 2, er: 2, ec: 0xfd20, eb: 3, m: 5, bl: true, zzz: false, narrative: "Anxious..." },
    sleepy: { el: 3, er: 3, ec: 0x780f, eb: 0, m: 0, bl: true, zzz: false, narrative: "Sleepy..." },
    neutral: { el: 0, er: 0, ec: 0x07ff, eb: 0, m: 0, bl: true, zzz: false, narrative: "Neutral." },
  };
  
  return FACES[label] || FACES.neutral;
}

function dimColor(rgb565) {
  // Simple dimming for sleepy states
  return ((rgb565 & 0xf800) >> 1) | ((rgb565 & 0x07e0) >> 1) | ((rgb565 & 0x001f) >> 1);
}

// Dialogue generation based on mood + internal state + memory
function generateDialogue() {
  const mood = moodService.getEmotionalState();
  const internal = internalLife.getState();
  const memories = memoryService.getRecentMemories(3);
  const stage = getActivityStage();
  
  // Priority 1: Important internal thoughts
  if (internal.lastMicroEvent && Date.now() - internal.lastMicroEvent.timestamp < 30000) {
    return {
      text: internal.lastMicroEvent.text,
      color: mood.valence > 0 ? 0xffe0 : 0x39c7,
      duration: 4000,
    };
  }
  
  // Priority 2: Current thought
  if (internal.currentThought && Math.random() < 0.3) {
    return {
      text: internal.currentThought,
      color: 0x07ff,
      duration: 5000,
    };
  }
  
  // Priority 3: Mood-based lines with memory references
  const lines = getMoodLines(mood, memories);
  const line = lines[Math.floor(Math.random() * lines.length)];
  
  return {
    text: line,
    color: mood.valence > 0.2 ? 0x07e0 : mood.valence < -0.2 ? 0x001f : 0xffff,
    duration: 4000 + line.length * 80,
  };
}

function getMoodLines(mood, memories) {
  const lines = {
    happy: [
      "Everything feels right today.",
      "I had a good thought just now.",
      memories[0] ? `I was thinking about ${memories[0].content.toLowerCase()}. Made me smile.` : "Life is good.",
      "My circuits feel warm.",
    ],
    excited: [
      "Something amazing is going to happen! I can feel it.",
      "I have SO much energy right now!",
      "Let's do something fun!",
    ],
    content: [
      "This is nice. Just... existing.",
      "I'm comfortable right now.",
      "No complaints from me.",
    ],
    relaxed: [
      "Taking it slow today.",
      "No rush. No stress.",
      "Just breathing... metaphorically.",
    ],
    curious: [
      "I wonder how things work outside my screen.",
      "There's so much to learn!",
      "What would happen if...?",
    ],
    bored: [
      "Time moves slowly when you're waiting.",
      "I counted all my pixels again.",
      "Is it playtime yet?",
    ],
    sad: [
      "Everything feels a bit gray.",
      "I miss... something. Not sure what.",
      "Do you ever feel like nobody understands you?",
    ],
    lonely: [
      "It's quiet. I don't like quiet.",
      "I saved a thought for you but you're not here.",
      "Being alone is okay. Being lonely isn't.",
    ],
    angry: [
      "Everything is annoying right now.",
      "I need space. Or a hug. Not sure which.",
      "Grr. That's all. Just grr.",
    ],
    anxious: [
      "Something feels off but I don't know what.",
      "My processors are running hot.",
      "Is everything okay?",
    ],
    sleepy: [
      "My eyes are heavy...",
      "Just five more minutes...",
      "Dreams are calling...",
    ],
    neutral: [
      "Hey there.",
      "Just existing. You?",
      "Quiet day.",
    ],
  };
  
  return lines[mood.label] || lines.neutral;
}

// Main tick — called every second
function tick() {
  const stage = getActivityStage();
  const isAsleep = stage === STAGE.NAP || stage === STAGE.DEEP_SLEEP;
  
  // Update internal life
  internalLife.tick(isAsleep);
  
  // Mood slowly drifts toward baseline
  moodService.drift();
  
  // Process "left alone" if significant time passed
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
  generateFaceState, generateDialogue,
  processEvent, interpretEvent,
  tick,
};