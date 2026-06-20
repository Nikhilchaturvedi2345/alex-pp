/**
 * Alex Brain v3.0  —  Phase 1: Mode Framework
 * ──────────────────────────────────────────────────────────────
 * Built on top of v2.1 (server-centric + lazy companion / sleep
 * system). All existing behavior is preserved:
 *
 *   - Real interaction vs. poll distinction (/interact, /game wake
 *     Alex; /state polling does not).
 *   - ACTIVE / RELAXED / SLEEPY / NAP / DEEP_SLEEP stages drive face,
 *     dialogue frequency, and poll interval.
 *   - Mini-games (rps, guess) unchanged.
 *
 * NEW IN v3.0 (Phase 1 of the roadmap):
 *   - services/memory.service.js   — persistence, extracted
 *   - services/emotion.service.js  — emotion engine + stages, extracted
 *   - services/mode.service.js     — mode registry + switching
 *   - modes/*.mode.js               — one descriptor per mode
 *   - POST /mode  — switch Alex's active mode
 *   - GET  /ui    — drives ESP menu rendering
 *
 * Face/dialogue/game logic stays here for now — Phase 1 is
 * explicitly "framework only, don't fully implement each mode yet."
 * Phases 3-6 will move their logic into the matching mode files.
 */

const express = require("express");
const cors = require("cors");

const memoryService = require("./services/memory.service");
const emotionService = require("./services/emotion.service");
const modeService = require("./services/mode.service");

const app = express();
app.use(cors());
app.use(express.json());

// Phase 2: the ESP's HTTP client occasionally sends truncated/odd
// bodies on flaky WiFi. Without this, a JSON parse error from
// express.json() would propagate as an unhandled 500 with no body.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: "Malformed JSON body" });
  }
  next(err);
});

// ─────────────────────────────────────────────────────────────────
// Eye / Mouth / Eyebrow / Color enums  (must match ESP #defines)
// ─────────────────────────────────────────────────────────────────
const EYE = {
  ROUND: 0,
  ALMOND: 1,
  WIDE: 2,
  SQUINT: 3,
  HEART: 4,
  X: 5,
  STAR: 6,
  CRESCENT: 7,
  ANGRY: 8,
};

const MOUTH = {
  NEUTRAL: 0,
  SMILE: 1,
  FROWN: 2,
  OPEN: 3,
  SMIRK: 4,
  OOO: 5,
  GRIN: 6,
};

const BROW = {
  NEUTRAL: 0,
  RAISED: 1,
  FURROWED: 2,
  WORRIED: 3,
};

const C = {
  WHITE: 0xffff,
  CYAN: 0x07ff,
  GREEN: 0x07e0,
  YELLOW: 0xffe0,
  MAGENTA: 0xf81f,
  ORANGE: 0xfd20,
  BLUE: 0x001f,
  RED: 0xf800,
  PURPLE: 0x780f,
  TEAL: 0x0410,
  PINK: 0xfb56,
  LIME: 0x87e0,
  DIMBLUE: 0x10a2,
  DIMGRAY: 0x39c7,
};

const STAGE = emotionService.STAGE;

// ─────────────────────────────────────────────────────────────────
// Wake / Dream lines
// ─────────────────────────────────────────────────────────────────
const WAKE_LINES = [
  "oh! you're back.",
  "good to see you again!",
  "i was taking a nap.",
  "*stretches* hi!",
  "mm? oh, hello!",
  "you woke me up~",
];

const DREAM_LINES = [
  "i had a strange dream.",
  "i dreamed i won a game.",
  "i dreamed it was snowing.",
  "i dreamed about you, actually.",
  "i had the weirdest dream just now.",
  "i was dreaming about adventures.",
];

function getWakeLine() {
  if (Math.random() < 0.45) return pick(DREAM_LINES);
  return pick(WAKE_LINES);
}

// ─────────────────────────────────────────────────────────────────
// Expression Generator  — stage overrides come BEFORE emotion faces
// ─────────────────────────────────────────────────────────────────
function generateFaceState() {
  const period = emotionService.getSchedulePeriod();
  const stage = emotionService.getActivityStage();
  const dominant = emotionService.getDominantEmotion();
  const emo = emotionService.getEmotions();

  if (period === "SLEEPING" || stage === STAGE.DEEP_SLEEP) {
    return {
      el: EYE.CRESCENT, er: EYE.CRESCENT, ec: C.DIMGRAY,
      eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: true,
    };
  }

  if (stage === STAGE.NAP) {
    return {
      el: EYE.CRESCENT, er: EYE.CRESCENT, ec: C.DIMBLUE,
      eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: true,
    };
  }

  if (stage === STAGE.SLEEPY) {
    const yawning = rand() < 0.15;
    return {
      el: EYE.SQUINT, er: EYE.SQUINT, ec: C.PURPLE,
      eb: BROW.NEUTRAL, m: yawning ? MOUTH.OOO : MOUTH.NEUTRAL,
      bl: false, zzz: false,
    };
  }

  if (stage === STAGE.RELAXED) {
    return {
      el: EYE.ALMOND, er: EYE.ALMOND, ec: C.TEAL,
      eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: false,
    };
  }

  if (period === "WAKING_UP" && emo.sleepiness > 50) {
    return {
      el: EYE.SQUINT, er: EYE.SQUINT, ec: C.YELLOW,
      eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: false,
    };
  }

  const EMO_FACES = {
    sleepiness: { el: EYE.CRESCENT, er: EYE.CRESCENT, ec: C.PURPLE, eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: emo.sleepiness > 60 },
    excitement: { el: EYE.WIDE, er: EYE.WIDE, ec: C.YELLOW, eb: BROW.RAISED, m: MOUTH.GRIN, bl: false, zzz: false },
    happiness: { el: EYE.ALMOND, er: EYE.ALMOND, ec: C.GREEN, eb: BROW.RAISED, m: MOUTH.SMILE, bl: rand() < 0.25, zzz: false },
    curiosity: { el: EYE.WIDE, er: EYE.ALMOND, ec: C.CYAN, eb: BROW.RAISED, m: MOUTH.OOO, bl: false, zzz: false },
    boredom: { el: EYE.SQUINT, er: EYE.SQUINT, ec: C.TEAL, eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: false },
    energy: { el: EYE.ROUND, er: EYE.ROUND, ec: C.LIME, eb: BROW.RAISED, m: MOUTH.SMILE, bl: false, zzz: false },
    confidence: { el: EYE.ALMOND, er: EYE.ALMOND, ec: C.ORANGE, eb: BROW.NEUTRAL, m: MOUTH.SMIRK, bl: false, zzz: false },
  };

  if (emo.boredom > 70 && emo.energy < 30) {
    return { el: EYE.ANGRY, er: EYE.ANGRY, ec: C.RED, eb: BROW.FURROWED, m: MOUTH.FROWN, bl: false, zzz: false };
  }

  const PERIOD_FACES = {
    STUDY: { el: EYE.ROUND, er: EYE.SQUINT, ec: C.CYAN, eb: BROW.FURROWED, m: MOUTH.NEUTRAL, bl: false, zzz: false },
    CREATIVE: { el: EYE.STAR, er: EYE.STAR, ec: C.MAGENTA, eb: BROW.RAISED, m: MOUTH.SMILE, bl: false, zzz: false },
    BREAKFAST: { el: EYE.ALMOND, er: EYE.ALMOND, ec: C.ORANGE, eb: BROW.RAISED, m: MOUTH.OPEN, bl: false, zzz: false },
    LUNCH: { el: EYE.ALMOND, er: EYE.ALMOND, ec: C.ORANGE, eb: BROW.RAISED, m: MOUTH.OPEN, bl: false, zzz: false },
    PLAY: { el: EYE.WIDE, er: EYE.WIDE, ec: C.YELLOW, eb: BROW.RAISED, m: MOUTH.GRIN, bl: false, zzz: false },
    EVENING: { el: EYE.ALMOND, er: EYE.ALMOND, ec: C.TEAL, eb: BROW.NEUTRAL, m: MOUTH.SMILE, bl: false, zzz: false },
    EARLY_MORNING: { el: EYE.HEART, er: EYE.HEART, ec: C.PINK, eb: BROW.NEUTRAL, m: MOUTH.SMILE, bl: true, zzz: false },
  };

  if (PERIOD_FACES[period] && rand() < 0.4) return PERIOD_FACES[period];

  return EMO_FACES[dominant] || EMO_FACES.happiness;
}

// ─────────────────────────────────────────────────────────────────
// Dialogue System
// ─────────────────────────────────────────────────────────────────
const DIALOGUE = {
  SLEEPING: ["zzz...", "...mmm...", "*dream noises*", "...nikhil...zzz", "zz..."],
  EARLY_MORNING: ["still sleepy...", "five more minutes...", "*yawn*", "not yet..."],
  WAKING_UP: ["good morning!", "*stretches*", "yaaawn~", "is it morning already?", "need coffee..."],
  BREAKFAST: ["breakfast time!", "nom nom nom~", "mmm, tasty!", "hungry!", "food!"],
  STUDY: ["learning stuff!", "ooh interesting!", "hmm...", "taking notes...", "did you know...", "complex...", "I got this.", "*thinking intensely*"],
  LUNCH: ["lunchtime!", "so hungry!", "what are we eating?", "nom nom~", "eating..."],
  PLAY: ["let's play!", "yay!", "catch me!", "woohoo!", "i'm winning!", "best day ever!", "play with me!", "zoom zoom"],
  CREATIVE: ["i made something!", "look what i drew!", "i have an idea!", "creating...", "inventing...", "building something..."],
  EVENING: ["how was your day?", "nice evening~", "relaxing...", "*stretches*", "feeling peaceful", "cozy vibes"],
  WIND_DOWN: ["getting sleepy...", "almost bedtime", "one more thing...", "yawn~", "today was good"],
  IDLE: ["hey there~", "boop!", "what's up?", "i missed you!", "hello world", "hi!"],
};

const STAGE_LINES = {
  RELAXED: ["i'm just relaxing.", "taking a small break.", "thinking quietly.", "calm mode~"],
  SLEEPY: ["i'm feeling sleepy.", "maybe i'll take a little nap.", "*yawn* so sleepy...", "need coffee..."],
  NAP: ["zzz...", "i'll wake up if you need me.", "...mmm...", "*soft breathing*"],
  DEEP_SLEEP: ["good night.", "sleeping...", "zzz...", "..."],
};

const WORLD_EVENTS = [
  "i learned a new fact!", "i drew something cool", "i had a really weird dream",
  "i invented a new game", "i found an interesting book", "i practiced dancing alone",
  "i solved a tricky puzzle!", "i wrote a tiny poem", "i built something in my mind",
  "i discovered a new joke", "i counted to a million (almost)", "i figured out something big",
  "i had a great idea for us", "i reorganized my thoughts", "i made up a new word",
];

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

function getContextualLine() {
  const period = emotionService.getSchedulePeriod();
  const stage = emotionService.getActivityStage();

  if (STAGE_LINES[stage]) return pick(STAGE_LINES[stage]);
  return pick(DIALOGUE[period] || DIALOGUE.IDLE);
}

function tickText() {
  const now = Date.now();
  const stage = emotionService.getActivityStage();

  if (textState.visible && now > textState.hideAt) {
    textState.visible = false;

    let gapMin, gapMax;
    switch (stage) {
      case STAGE.ACTIVE: gapMin = 25000; gapMax = 70000; break;
      case STAGE.RELAXED: gapMin = 60000; gapMax = 120000; break;
      case STAGE.SLEEPY: gapMin = 90000; gapMax = 180000; break;
      case STAGE.NAP: gapMin = 180000; gapMax = 360000; break;
      case STAGE.DEEP_SLEEP: gapMin = 300000; gapMax = 600000; break;
      default: gapMin = 25000; gapMax = 70000;
    }
    textState.nextAt = now + randInt(gapMin, gapMax);
  }

  if (!textState.visible && now > textState.nextAt) {
    const speakChance = stage === STAGE.ACTIVE ? 0.5 : 0.85;
    if (rand() < speakChance) {
      const textColors = stage === STAGE.ACTIVE
        ? [C.WHITE, C.CYAN, C.YELLOW, C.GREEN, C.MAGENTA]
        : [C.DIMBLUE, C.PURPLE, C.TEAL];
      const dur = stage === STAGE.ACTIVE ? 0 : 3000;
      scheduleText(getContextualLine(), pick(textColors), dur);
    } else {
      textState.nextAt = now + randInt(15000, 30000);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Mini-Games  (unchanged from v2.1 — Phase 3 will move these into
// modes/game.mode.js)
// ─────────────────────────────────────────────────────────────────
let activeGame = null;

const GAMES = {
  rps: {
    choices: ["rock", "paper", "scissors"],
    start() { activeGame = { type: "rps" }; return "rock paper scissors! pick"; },
    move(choice) {
      const alex = pick(this.choices);
      const wins = { rock: "scissors", paper: "rock", scissors: "paper" };
      let result;
      if (choice === alex) { result = `tie! we both picked ${alex}`; }
      else if (wins[choice] === alex) {
        result = `you win! i had ${alex}`;
        memoryService.awardXP(10, "rps win");
        emotionService.nudge("happiness", 5);
      } else {
        result = `i win! i had ${alex} hehe`;
        emotionService.nudge("confidence", 8);
        emotionService.nudge("excitement", 5);
      }
      activeGame = null;
      return result;
    },
  },
  guess: {
    start() {
      const n = randInt(1, 10);
      activeGame = { type: "guess", number: n, attempts: 3 };
      return `guess 1-10, ${activeGame.attempts} tries!`;
    },
    move(raw) {
      const n = parseInt(raw);
      if (isNaN(n)) return "type a number!";
      activeGame.attempts--;
      if (n === activeGame.number) {
        const bonus = activeGame.attempts * 5 + 5;
        memoryService.awardXP(bonus, "guess correct");
        emotionService.nudge("excitement", 15);
        activeGame = null;
        return `yes!! it was ${n}! +${bonus}xp`;
      }
      if (activeGame.attempts <= 0) {
        const ans = activeGame.number;
        activeGame = null;
        return `nope! it was ${ans}. again?`;
      }
      const hint = n < activeGame.number ? "higher!" : "lower!";
      return `${hint} ${activeGame.attempts} left`;
    },
  },
};

// ─────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────
function rand() { return Math.random(); }
function randInt(lo, hi) { return Math.floor(rand() * (hi - lo + 1)) + lo; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

function checkDailyStreak() {
  const today = emotionService.getIST().toUTCString().slice(0, 16);
  const incremented = memoryService.checkDailyStreak(today);
  if (incremented) {
    const memory = memoryService.get();
    if (memory.consecutiveDays > 1) {
      scheduleText(`day ${memory.consecutiveDays} together!`, C.YELLOW, 5000);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Express Routes
// ─────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  const memory = memoryService.get();
  res.json({
    success: true,
    service: "Alex Brain v3.0",
    status: "online",
    mode: modeService.getCurrentMode(),
    period: emotionService.getSchedulePeriod(),
    stage: emotionService.getActivityStage(),
    dominant: emotionService.getDominantEmotion(),
    level: memory.level,
    xp: memory.xp,
  });
});

// ── Phase 1: GET /ui — drives ESP menu rendering ─────────────────
app.get("/ui", (req, res) => {
  res.json(modeService.getUIState());
});

// ── Phase 1: POST /mode — switch Alex's active mode ──────────────
// Body: { "mode": "GAME" }
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

  // Mode switching IS real activity — same as a button press.
  emotionService.markInteractionAndDetectWake();

  if (result.changed) {
    scheduleText(result.ackLine, C.CYAN, 4500);
  }

  res.json(result);
});

// ── Main endpoint — polled by ESP, interval varies by stage ──────
// NOTE: this does NOT update memory.lastInteraction — polling is
// connectivity, not "activity". Only real interactions wake Alex.
app.get("/state", (req, res) => {
  memoryService.markSeen();
  const memory = memoryService.get();
  memoryService.set({ totalInteractions: memory.totalInteractions + 1 });
  checkDailyStreak();

  const stage = emotionService.getActivityStage();
  if (stage === STAGE.SLEEPY || stage === STAGE.NAP || stage === STAGE.DEEP_SLEEP) {
    emotionService.setWasAsleep(true);
  }

  const face = generateFaceState();

  res.json({
    el: face.el, er: face.er, ec: face.ec, eb: face.eb,
    m: face.m, bl: face.bl, zzz: face.zzz,
    txt: textState.visible ? textState.content : "",
    tc: textState.color,
    td: textState.visible ? Math.max(0, textState.hideAt - Date.now()) : 0,
    pi: emotionService.getPollIntervalForStage(stage),
    act: emotionService.getSchedulePeriod(),
    stg: stage,
    mode: modeService.getCurrentMode(),
    lvl: memoryService.get().level,
    xp: memoryService.get().xp,
  });
});

// ── Button press / user interaction — this IS real activity ─────
app.post("/interact", (req, res) => {
  const isWakingUp = emotionService.markInteractionAndDetectWake();
  const memory = memoryService.get();
  memoryService.set({ totalInteractions: memory.totalInteractions + 1 });

  emotionService.nudge("happiness", +10);
  emotionService.nudge("boredom", -15);
  emotionService.nudge("excitement", +8);
  emotionService.nudge("sleepiness", -20);
  memoryService.awardXP(2, "button press");

  if (isWakingUp) {
    scheduleText(getWakeLine(), C.YELLOW, 4500);
  } else {
    const reactions = [
      "hey! you pressed me!", "ooh, interaction!", "hi hi hi!",
      "*happy noises*", "hello!!", "boop~", "you're here!", "yay!",
    ];
    scheduleText(pick(reactions), C.YELLOW, 4000);
  }

  res.json({
    success: true,
    xp: memoryService.get().xp,
    level: memoryService.get().level,
    stage: emotionService.getActivityStage(),
    mode: modeService.getCurrentMode(),
  });
});

// ── Mini-game endpoint — also counts as real activity ────────────
app.post("/game", (req, res) => {
  const { game, action, value } = req.body;
  const isWakingUp = emotionService.markInteractionAndDetectWake();

  if (isWakingUp) {
    scheduleText(getWakeLine(), C.YELLOW, 4000);
  }

  if (action === "start") {
    if (!GAMES[game]) return res.json({ success: false, msg: "unknown game" });
    const msg = GAMES[game].start();
    if (!isWakingUp) scheduleText(msg, C.CYAN, 9000);
    return res.json({ success: true, msg });
  }

  if (action === "move" && activeGame) {
    const result = GAMES[activeGame.type].move(String(value));
    if (!isWakingUp) scheduleText(result, C.GREEN, 5000);
    return res.json({ success: true, msg: result });
  }

  return res.json({ success: false, msg: "no active game" });
});

// ── Emotions debug dump ──────────────────────────────────────────
app.get("/emotions", (req, res) => {
  const memory = memoryService.get();
  res.json({
    emotions: Object.fromEntries(
      Object.entries(emotionService.getEmotions()).map(([k, v]) => [k, Math.round(v)])
    ),
    dominant: emotionService.getDominantEmotion(),
    period: emotionService.getSchedulePeriod(),
    stage: emotionService.getActivityStage(),
    mode: modeService.getCurrentMode(),
    minsSinceInteraction: Math.round(emotionService.minsSinceInteraction()),
    hour_IST: emotionService.getISTHour(),
    memory: {
      level: memory.level, xp: memory.xp,
      lastSeen: new Date(memory.lastSeen).toISOString(),
      lastInteraction: new Date(memory.lastInteraction).toISOString(),
      streak: memory.consecutiveDays,
    },
  });
});

// ─────────────────────────────────────────────────────────────────
// Engine Ticks
// ─────────────────────────────────────────────────────────────────
memoryService.load();
modeService.init();

setInterval(emotionService.tick, 1000);
setInterval(tickText, 500);
setInterval(memoryService.save, 30000);

// World event burst — respects activity stage so it doesn't fire
// while Alex is supposed to be asleep.
setInterval(() => {
  const stage = emotionService.getActivityStage();
  if (stage !== STAGE.ACTIVE && stage !== STAGE.RELAXED) return;
  if (rand() < 0.1) {
    scheduleText(pick(WORLD_EVENTS), C.PINK, 5000);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nAlex Brain v3.0  →  port ${PORT}`);
  console.log(`IST hour:       ${emotionService.getISTHour()}:${String(emotionService.getISTMinutes()).padStart(2, "0")}`);
  console.log(`Schedule:       ${emotionService.getSchedulePeriod()}`);
  console.log(`Stage:          ${emotionService.getActivityStage()}`);
  console.log(`Mode:           ${modeService.getCurrentMode()}`);
  console.log(`Dominant emo:   ${emotionService.getDominantEmotion()}`);
  console.log(`Memory level:   ${memoryService.get().level}  (${memoryService.get().xp} XP)\n`);
});
