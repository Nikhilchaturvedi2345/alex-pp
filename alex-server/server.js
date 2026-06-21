/**
 * Alex Brain v4.0 — "The Inner World"
 * ───────────────────────────────────
 * Complete redesign. Alex now has:
 *   - Personality (who he is)
 *   - Mood (how he feels right now)
 *   - Internal life (what he's doing/thinking when alone)
 *   - Episodic memory (his autobiography)
 *   - Causal interpretation (he knows WHY he feels things)
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

// ── Color / Face enums (match ESP) ─────────────────────────────
const C = {
  WHITE: 0xffff, CYAN: 0x07ff, GREEN: 0x07e0, YELLOW: 0xffe0,
  MAGENTA: 0xf81f, ORANGE: 0xfd20, BLUE: 0x001f, RED: 0xf800,
  PURPLE: 0x780f, TEAL: 0x0410, PINK: 0xfb56, LIME: 0x87e0,
  DIMBLUE: 0x10a2, DIMGRAY: 0x39c7,
};

const STAGE = emotionEngine.STAGE;

// ── Text state ─────────────────────────────────────────────────
let textState = {
  visible: false,
  content: "",
  color: C.WHITE,
  hideAt: 0,
  nextAt: Date.now() + 5000,
};

function scheduleText(content, color = C.WHITE, durationMs = 0) {
  const dur = durationMs || (4000 + content.length * 80);
  textState.content = content.slice(0, 40);
  textState.color = color;
  textState.visible = true;
  textState.hideAt = Date.now() + dur;
}

// ── Wake lines (context-aware) ─────────────────────────────────
function getWakeLine(wakeData) {
  const personality = personalityService.get();
  const lines = [];
  
  if (wakeData.hadDream) {
    lines.push(`I had a dream... ${wakeData.dreamContent}`);
    lines.push("I was dreaming just now. It was weird.");
  }
  
  if (wakeData.sleepQuality > 0.7) {
    lines.push("Good morning! I slept well.");
    lines.push("I feel so refreshed!");
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

// ── Routes ───────────────────────────────────────────────────────

app.get("/", (req, res) => {
  const memory = memoryService.get();
  const mood = moodService.get();
  const internal = internalLife.getState();
  
  res.json({
    success: true,
    service: "Alex Brain v4.0 — The Inner World",
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
  
  if (!result.success) {
    return res.status(400).json(result);
  }
  
  const wakeData = emotionEngine.markInteractionAndDetectWake();
  
  if (result.changed) {
    emotionEngine.processEvent("mode_switch", { mode: result.mode });
    scheduleText(result.ackLine, C.CYAN, 4500);
  }
  
  res.json({
    ...result,
    wakeData: wakeData.isWakingUp ? wakeData : null,
  });
});

app.get("/state", (req, res) => {
  memoryService.markSeen();
  const memory = memoryService.get();
  memoryService.set({ totalInteractions: memory.totalInteractions + 1 });
  
  const stage = emotionEngine.getActivityStage();
  const face = emotionEngine.generateFaceState();
  const dialogue = emotionEngine.generateDialogue();
  
  // Update text state if dialogue is ready
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
  
  res.json({
    el: face.el, er: face.er, ec: face.ec, eb: face.eb,
    m: face.m, bl: face.bl, zzz: face.zzz,
    txt: textState.visible ? textState.content : "",
    tc: textState.color,
    td: textState.visible ? Math.max(0, textState.hideAt - Date.now()) : 0,
    pi: emotionEngine.getPollIntervalForStage(stage),
    act: emotionEngine.getSchedulePeriod(),
    stg: stage,
    mode: modeService.getCurrentMode(),
    lvl: memory.level,
    xp: memory.xp,
    narrative: face.narrative, // NEW: Alex tells you his internal state
  });
});

app.post("/interact", (req, res) => {
  const wakeData = emotionEngine.markInteractionAndDetectWake();
  const memory = memoryService.get();
  
  emotionEngine.processEvent("user_interaction", { quality: 0.8 });
  memoryService.awardXP(2, "button press");
  
  if (wakeData.isWakingUp) {
    scheduleText(getWakeLine(wakeData), C.YELLOW, 5000);
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
  // NEW endpoint: peek into Alex's inner world
  const mood = moodService.get();
  const internal = internalLife.getState();
  const recentMemories = memoryService.getRecentMemories(5);
  
  res.json({
    mood: {
      label: moodService.getLabel(),
      ...mood,
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
  });
});

app.get("/memories", (req, res) => {
  const { type, limit = 10 } = req.query;
  const memories = memoryService.getRecentMemories(parseInt(limit), type || null);
  res.json({ memories });
});

// ── Engine Ticks ───────────────────────────────────────────────
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
  console.log(`\n🤖 Alex Brain v4.0 — The Inner World`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Mood: ${moodService.getLabel()}`);
  console.log(`   Personality: E=${personalityService.get().extraversion} A=${personalityService.get().agreeableness}`);
  console.log(`   Activity: ${internalLife.getState().currentActivity}`);
  console.log(`   Stage: ${emotionEngine.getActivityStage()}`);
  console.log(`   Mode: ${modeService.getCurrentMode()}\n`);
});