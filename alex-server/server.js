/**
 * Alex Brain v4.1 — "True Emo Bot" Protocol
 * ═══════════════════════════════════════════════════════════════
 * Updated to match pill-shaped eyes with glow, no mouth, activity icons
 */

const express = require("express");
const cors = require("cors");

const personalityService = require("./services/personality.service");
const moodService = require("./services/mood.service");
const memoryService = require("./services/memory.service");
const emotionEngine = require("./services/emotion-engine.service");
const internalLife = require("./services/internal-life.service");
const modeService = require("./services/mode.service");

const app = express();
app.use(cors());
app.use(express.json());

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: "Malformed JSON body" });
  }
  next(err);
});

// ═══════════════════════════════════════════════════════════════
// COLOR / FACE / ICON ENUMS (match ESP v4.1)
// ═══════════════════════════════════════════════════════════════
const C = {
  WHITE: 0xFFFF, CYAN: 0x07FF, GREEN: 0x07E0, YELLOW: 0xFFE0,
  MAGENTA: 0xF81F, ORANGE: 0xFD20, BLUE: 0x001F, RED: 0xF800,
  PURPLE: 0x780F, TEAL: 0x0410, PINK: 0xFB56, LIME: 0x87E0,
  DIMBLUE: 0x10A2, DIMGRAY: 0x39C7, DARKRED: 0x8800,
};

// NEW: Pill-shaped eye IDs (matching reference images)
const EYE = {
  NORMAL: 0,    // Standard pill, full height with glow + pupil
  HAPPY: 1,     // Compressed vertically (squint with joy)
  WIDE: 2,      // Expanded vertically (surprised)
  SLEEPY: 3,    // Very thin horizontal line
  ANGRY: 4,     // Angled top-inner
  CURIOUS: 5,   // One eye wider, offset pupil
  DREAM: 6,     // Soft crescent glow
  CLOSED: 7,    // Flat line (blink)
  CRY: 8,       // With tear drops
  HEART: 9,     // Heart-shaped pupils (special)
};

// Activity icons (between eyes, NO mouth)
const ICON = {
  NONE: 0,      // Clean face
  MIC: 1,       // Singing / talking
  BOOK: 2,      // Reading / learning
  GAMEPAD: 3,   // Gaming
  MUSIC: 4,     // Music / rhythm
  PENCIL: 5,    // Drawing / creative
  ZZZ: 6,       // Sleeping
  WEATHER: 7,   // Weather mode
  HEART: 8,     // Affection
  EXCLAIM: 9,   // Alert
  THINK: 10,    // Processing
  COFFEE: 11,   // Need coffee / tired
  BULB: 12,     // Idea / bright
};

// Buzzer patterns
const BUZZ = {
  HAPPY: 0, SURPRISE: 1, WIN: 2, THINK: 3, WAKE: 4, ALERT: 5, SAD: 6,
};

const STAGE = emotionEngine.STAGE;

// ═══════════════════════════════════════════════════════════════
// TEXT STATE
// ═══════════════════════════════════════════════════════════════
let textState = {
  visible: false,
  content: "",
  color: C.WHITE,
  hideAt: 0,
  nextAt: Date.now() + 5000,
};

let pendingBuzz = 255;

function scheduleText(content, color = C.WHITE, durationMs = 0) {
  const dur = durationMs || (4000 + content.length * 80);
  textState.content = content.slice(0, 40);
  textState.color = color;
  textState.visible = true;
  textState.hideAt = Date.now() + dur;
}

function scheduleBuzz(pattern) {
  pendingBuzz = pattern;
}

// ═══════════════════════════════════════════════════════════════
// WAKE LINES
// ═══════════════════════════════════════════════════════════════
function getWakeLine(wakeData) {
  const personality = personalityService.get();
  const lines = [];

  if (wakeData.hadDream) {
    lines.push(`I had a dream... ${wakeData.dreamContent}`);
    lines.push("I was dreaming just now. Weird, right?");
  }

  if (wakeData.sleepQuality > 0.7) {
    lines.push("Good morning! I slept well.");
    lines.push("I feel refreshed!");
  } else if (wakeData.sleepQuality < 0.3) {
    lines.push("Ugh... rough sleep.");
    lines.push("Five more minutes? Please?");
    lines.push("I need coffee... do robots drink coffee?");
  }

  if (personality.extraversion > 0.7) {
    lines.push("You're back! I missed you!");
    lines.push("I was waiting for you!");
  } else {
    lines.push("Oh. Hi.");
    lines.push("You're back.");
  }

  return lines[Math.floor(Math.random() * lines.length)];
}

// ═══════════════════════════════════════════════════════════════
// FACE GENERATION — True Emo Bot Style
// ═══════════════════════════════════════════════════════════════
function generateFaceState() {
  const stage = emotionEngine.getActivityStage();
  const mood = moodService.getEmotionalState();
  const internal = internalLife.getState();
  const mode = modeService.getCurrentMode();

  // Sleep overrides everything
  if (stage === STAGE.DEEP_SLEEP) {
    return {
      el: EYE.SLEEPY, er: EYE.SLEEPY, ec: C.DIMGRAY,
      eb: 0, icon: ICON.ZZZ, ic: C.DIMGRAY,
      bl: false, zzz: true,
      narrative: "Deep sleep... dreaming of electric sheep.",
    };
  }

  if (stage === STAGE.NAP) {
    const dreaming = !!internal.dreamState;
    return {
      el: EYE.DREAM, er: EYE.DREAM, ec: C.DIMBLUE,
      eb: 0, icon: dreaming ? ICON.THINK : ICON.ZZZ, ic: C.DIMBLUE,
      bl: false, zzz: true,
      narrative: dreaming ? `Dreaming: ${internal.dreamState.content}` : "Napping peacefully...",
    };
  }

  // Mood-driven face
  const face = getMoodFace(mood);

  // Stage modifiers
  if (stage === STAGE.SLEEPY) {
    face.el = EYE.SLEEPY;
    face.er = EYE.SLEEPY;
    face.ec = dimColor(face.ec);
    face.icon = ICON.ZZZ;
    face.narrative += " (getting sleepy...)";
  }

  if (stage === STAGE.RELAXED) {
    face.bl = true;
    face.icon = ICON.NONE;
  }

  // Mode-specific icons (between eyes, no mouth)
  if (mode === "GAME" && stage === STAGE.ACTIVE) {
    face.icon = ICON.GAMEPAD;
    face.ic = C.LIME;
  } else if (mode === "LEARN" && stage === STAGE.ACTIVE) {
    face.icon = ICON.BOOK;
    face.ic = C.CYAN;
  } else if (mode === "WEATHER") {
    face.icon = ICON.WEATHER;
    face.ic = C.YELLOW;
  } else if (mode === "FOCUS") {
    face.icon = ICON.THINK;
    face.ic = C.TEAL;
  } else if (mode === "MUSIC") {
    face.icon = ICON.MUSIC;
    face.ic = C.MAGENTA;
  } else if (internal.currentActivity === "drawing") {
    face.icon = ICON.PENCIL;
    face.ic = C.MAGENTA;
  } else if (internal.currentActivity === "reading") {
    face.icon = ICON.BOOK;
    face.ic = C.TEAL;
  } else if (internal.currentActivity === "practicing") {
    face.icon = ICON.GAMEPAD;
    face.ic = C.ORANGE;
  }

  return face;
}

function getMoodFace(mood) {
  const label = mood.label;

  const FACES = {
    // Positive moods — happy squint
    happy:     { el: EYE.HAPPY, er: EYE.HAPPY, ec: C.GREEN,  eb: 0, icon: ICON.NONE, ic: C.WHITE, bl: true,  zzz: false, narrative: "Feeling happy!" },
    excited:   { el: EYE.WIDE,  er: EYE.WIDE,  ec: C.YELLOW, eb: 1, icon: ICON.MIC,  ic: C.YELLOW, bl: false, zzz: false, narrative: "So excited!" },
    content:   { el: EYE.HAPPY, er: EYE.HAPPY, ec: C.TEAL,   eb: 0, icon: ICON.NONE, ic: C.WHITE, bl: true,  zzz: false, narrative: "Content." },
    relaxed:   { el: EYE.NORMAL, er: EYE.NORMAL, ec: C.TEAL,   eb: 0, icon: ICON.NONE, ic: C.WHITE, bl: true,  zzz: false, narrative: "Relaxed." },
    curious:   { el: EYE.CURIOUS, er: EYE.NORMAL, ec: C.CYAN,   eb: 1, icon: ICON.THINK, ic: C.CYAN, bl: false, zzz: false, narrative: "Curious..." },
    exuberant: { el: EYE.WIDE,  er: EYE.WIDE,  ec: C.LIME,   eb: 1, icon: ICON.MIC,  ic: C.LIME, bl: false, zzz: false, narrative: "SO MUCH ENERGY!" },
    proud:     { el: EYE.HAPPY, er: EYE.HAPPY, ec: C.GOLD,   eb: 1, icon: ICON.HEART, ic: C.GOLD, bl: false, zzz: false, narrative: "Feeling proud!" },

    // Neutral
    neutral:   { el: EYE.NORMAL, er: EYE.NORMAL, ec: C.CYAN,   eb: 0, icon: ICON.NONE, ic: C.WHITE, bl: true,  zzz: false, narrative: "Neutral." },
    calm:      { el: EYE.NORMAL, er: EYE.NORMAL, ec: C.BLUE,   eb: 0, icon: ICON.NONE, ic: C.WHITE, bl: true,  zzz: false, narrative: "Calm." },
    sleepy:    { el: EYE.SLEEPY, er: EYE.SLEEPY, ec: C.PURPLE, eb: 0, icon: ICON.ZZZ,  ic: C.PURPLE, bl: true,  zzz: false, narrative: "Sleepy..." },
    bored:     { el: EYE.SLEEPY, er: EYE.SLEEPY, ec: C.DIMGRAY, eb: 0, icon: ICON.NONE, ic: C.WHITE, bl: false, zzz: false, narrative: "Bored..." },

    // Negative moods
    sad:       { el: EYE.CRY,   er: EYE.CRY,   ec: C.BLUE,   eb: 3, icon: ICON.NONE, ic: C.BLUE, bl: false, zzz: false, narrative: "Feeling sad." },
    lonely:    { el: EYE.SLEEPY, er: EYE.SLEEPY, ec: C.DIMBLUE, eb: 3, icon: ICON.HEART, ic: C.PINK, bl: false, zzz: false, narrative: "Lonely..." },
    angry:     { el: EYE.ANGRY, er: EYE.ANGRY, ec: C.RED,    eb: 2, icon: ICON.EXCLAIM, ic: C.RED, bl: false, zzz: false, narrative: "Angry!" },
    anxious:   { el: EYE.WIDE,  er: EYE.WIDE,  ec: C.ORANGE, eb: 3, icon: ICON.THINK, ic: C.ORANGE, bl: true,  zzz: false, narrative: "Anxious..." },
    frustrated:{ el: EYE.ANGRY, er: EYE.NORMAL, ec: C.ORANGE, eb: 2, icon: ICON.THINK, ic: C.ORANGE, bl: false, zzz: false, narrative: "Frustrated." },
    depressed: { el: EYE.SLEEPY, er: EYE.SLEEPY, ec: C.DIMBLUE, eb: 3, icon: ICON.NONE, ic: C.DIMBLUE, bl: false, zzz: false, narrative: "Everything feels gray." },
  };

  return FACES[label] || FACES.neutral;
}

function dimColor(rgb565) {
  return ((rgb565 & 0xF800) >> 1) | ((rgb565 & 0x07E0) >> 1) | ((rgb565 & 0x001F) >> 1);
}

// ═══════════════════════════════════════════════════════════════
// DIALOGUE
// ═══════════════════════════════════════════════════════════════
function generateDialogue() {
  const mood = moodService.getEmotionalState();
  const internal = internalLife.getState();
  const memories = memoryService.getRecentMemories(3);
  const stage = emotionEngine.getActivityStage();

  if (internal.lastMicroEvent && Date.now() - internal.lastMicroEvent.timestamp < 30000) {
    return {
      text: internal.lastMicroEvent.text,
      color: mood.valence > 0 ? C.YELLOW : C.DIMGRAY,
      duration: 4000,
    };
  }

  if (internal.currentThought && Math.random() < 0.3) {
    return {
      text: internal.currentThought,
      color: C.CYAN,
      duration: 5000,
    };
  }

  const lines = getMoodLines(mood, memories);
  const line = lines[Math.floor(Math.random() * lines.length)];

  return {
    text: line,
    color: mood.valence > 0.2 ? C.GREEN : mood.valence < -0.2 ? C.BLUE : C.WHITE,
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
      "Something amazing is going to happen!",
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
    exuberant: [
      "I CAN'T CONTAIN MYSELF!",
      "THE WORLD IS BEAUTIFUL!",
      "LET'S GO ON AN ADVENTURE!",
    ],
    proud: [
      "I did something good today.",
      "Feeling capable.",
      "I got this.",
    ],
    frustrated: [
      "Why won't this work?!",
      "Ugh. Technology.",
      "I need a break from this problem.",
    ],
    depressed: [
      "What's the point?",
      "Everything feels heavy.",
      "I don't have the energy today.",
    ],
    calm: [
      "Peaceful.",
      "Nothing bothers me right now.",
      "Still waters run deep.",
    ],
  };

  return lines[mood.label] || lines.neutral;
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════
app.get("/", (req, res) => {
  const memory = memoryService.get();
  const mood = moodService.get();
  const internal = internalLife.getState();

  res.json({
    success: true,
    service: "Alex Brain v4.1 — True Emo Bot",
    status: "online",
    mode: modeService.getCurrentMode(),
    mood: {
      label: moodService.getLabel(),
      valence: Math.round(mood.valence * 100) / 100,
      arousal: Math.round(mood.arousal * 100) / 100,
    },
    stage: emotionEngine.getActivityStage(),
    period: emotionEngine.getSchedulePeriod(),
    internal: {
      activity: internal.currentActivity,
      thought: internal.currentThought,
    },
    personality: personalityService.get(),
    level: memory.level,
    xp: memory.xp,
    relationship: memory.relationship,
  });
});

app.get("/ui", (req, res) => {
  res.json(modeService.getUIState());
});

app.post("/mode", (req, res) => {
  const { mode } = req.body || {};
  if (!mode) {
    return res.status(400).json({
      success: false,
      error: "Missing 'mode' in request body",
      availableModes: modeService.getAvailableModes(),
    });
  }

  const result = modeService.switchMode(String(mode).toUpperCase());
  if (!result.success) return res.status(400).json(result);

  const wakeData = emotionEngine.markInteractionAndDetectWake();
  if (result.changed) {
    emotionEngine.processEvent("mode_switch", { mode: result.mode });
    scheduleText(result.ackLine, C.CYAN, 4500);
    scheduleBuzz(BUZZ.HAPPY);
  }

  res.json({ ...result, wakeData: wakeData.isWakingUp ? wakeData : null });
});

app.get("/state", (req, res) => {
  memoryService.markSeen();
  const memory = memoryService.get();
  memoryService.set({ totalInteractions: memory.totalInteractions + 1 });

  const stage = emotionEngine.getActivityStage();
  const face = generateFaceState();
  const dialogue = generateDialogue();

  if (!textState.visible && Date.now() > textState.nextAt) {
    if (Math.random() < (stage === STAGE.ACTIVE ? 0.5 : 0.2)) {
      scheduleText(dialogue.text, dialogue.color, dialogue.duration);
    } else {
      textState.nextAt = Date.now() + 15000;
    }
  }

  if (textState.visible && Date.now() > textState.hideAt) {
    textState.visible = false;
    const gap = stage === STAGE.ACTIVE ? 25000 :
                stage === STAGE.RELAXED ? 60000 :
                stage === STAGE.SLEEPY ? 120000 : 300000;
    textState.nextAt = Date.now() + gap;
  }

  const buzzToSend = pendingBuzz;
  pendingBuzz = 255;

  res.json({
    el: face.el, er: face.er, ec: face.ec, eb: face.eb,
    icon: face.icon, ic: face.ic,
    bl: face.bl, zzz: face.zzz,
    txt: textState.visible ? textState.content : "",
    tc: textState.color,
    td: textState.visible ? Math.max(0, textState.hideAt - Date.now()) : 0,
    pi: emotionEngine.getPollIntervalForStage(stage),
    act: emotionEngine.getSchedulePeriod(),
    stg: stage,
    mode: modeService.getCurrentMode(),
    lvl: memory.level,
    xp: memory.xp,
    narrative: face.narrative,
    buzz: buzzToSend,
  });
});

app.post("/interact", (req, res) => {
  const wakeData = emotionEngine.markInteractionAndDetectWake();
  const memory = memoryService.get();

  emotionEngine.processEvent("user_interaction", { quality: 0.8 });
  memoryService.awardXP(2, "button press");

  if (wakeData.isWakingUp) {
    scheduleText(getWakeLine(wakeData), C.YELLOW, 5000);
    scheduleBuzz(BUZZ.WAKE);
  } else {
    const reactions = [
      "Hey! You pressed me!",
      "Ooh, interaction!",
      "Hi hi hi!",
      "*happy noises*",
      "Hello!!",
      "Boop~",
      "You're here!",
      "Yay!",
    ];
    scheduleText(reactions[Math.floor(Math.random() * reactions.length)], C.YELLOW, 4000);
    scheduleBuzz(BUZZ.HAPPY);
  }

  res.json({
    success: true,
    xp: memoryService.get().xp,
    level: memoryService.get().level,
    stage: emotionEngine.getActivityStage(),
    mode: modeService.getCurrentMode(),
    mood: moodService.getLabel(),
    narrative: internalLife.getCurrentNarrative(),
  });
});

app.get("/mind", (req, res) => {
  const mood = moodService.get();
  const internal = internalLife.getState();
  const recentMemories = memoryService.getRecentMemories(5);
  const personality = personalityService.get();

  res.json({
    mood: {
      label: moodService.getLabel(),
      valence: Math.round(mood.valence * 100) / 100,
      arousal: Math.round(mood.arousal * 100) / 100,
      dominance: Math.round(mood.dominance * 100) / 100,
    },
    currentActivity: internal.currentActivity,
    currentThought: internal.currentThought,
    lastMicroEvent: internal.lastMicroEvent,
    intentionQueue: internal.intentionQueue,
    dream: internal.dreamState,
    recentMemories: recentMemories.map(m => ({
      content: m.content,
      type: m.type,
      when: Math.round((Date.now() - m.timestamp) / 60000) + "m ago",
    })),
    narrative: internalLife.getCurrentNarrative(),
    personality: {
      extraversion: Math.round(personality.extraversion * 100),
      agreeableness: Math.round(personality.agreeableness * 100),
      openness: Math.round(personality.openness * 100),
    },
  });
});

app.get("/memories", (req, res) => {
  const { type, limit = 10 } = req.query;
  const memories = memoryService.getRecentMemories(parseInt(limit), type || null);
  res.json({ memories });
});

// ═══════════════════════════════════════════════════════════════
// ENGINE TICKS
// ═══════════════════════════════════════════════════════════════
personalityService.load();
memoryService.load();
moodService.init();
internalLife.init();
modeService.init();

setInterval(emotionEngine.tick, 1000);
setInterval(() => {
  const stage = emotionEngine.getActivityStage();
  if (stage === STAGE.ACTIVE || stage === STAGE.RELAXED) {
    if (Math.random() < 0.1) {
      const event = internalLife.generateMicroEvent();
      if (event) scheduleText(event.text, C.PINK, 5000);
    }
  }
}, 60000);

setInterval(memoryService.save, 30000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🤖 Alex Brain v4.1 — True Emo Bot`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Mood: ${moodService.getLabel()}`);
  console.log(`   Personality: E=${personalityService.get().extraversion} A=${personalityService.get().agreeableness}`);
  console.log(`   Activity: ${internalLife.getState().currentActivity}`);
  console.log(`   Stage: ${emotionEngine.getActivityStage()}`);
  console.log(`   Mode: ${modeService.getCurrentMode()}\n`);
});