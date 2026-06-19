/**
 * Alex Brain v2.1  —  Server-Centric Architecture + Lazy Companion System
 *
 * NEW IN THIS VERSION (feature #11 — Lazy Companion & Sleep System)
 * ──────────────────────────────────────────────────────────────
 * Alex now tracks REAL user interaction separately from ESP polling.
 * Polling /state does NOT count as "activity" — only /interact and
 * /game do. This is critical: if polling reset the inactivity timer,
 * Alex could never fall asleep (the ESP polls forever on its own).
 *
 *   ACTIVE      < 5 min since last real interaction
 *   RELAXED     5–15 min
 *   SLEEPY      15–45 min
 *   NAP         45–90 min
 *   DEEP_SLEEP  90+ min (or nighttime schedule SLEEPING period)
 *
 * Each stage changes: poll interval (server tells ESP how often to
 * ask), face/eyes, dialogue pool, ambient-text frequency, and theme
 * dimming. Waking up (button press / game / any /interact) plays a
 * greeting, and sometimes a "dream" line if Alex was asleep a while.
 */

const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────
// Eye / Mouth / Eyebrow / Color enums  (must match ESP #defines)
// ─────────────────────────────────────────────────────────────────
const EYE = {
  ROUND:    0,
  ALMOND:   1,
  WIDE:     2,
  SQUINT:   3,
  HEART:    4,
  X:        5,
  STAR:     6,
  CRESCENT: 7,
  ANGRY:    8,
};

const MOUTH = {
  NEUTRAL: 0,
  SMILE:   1,
  FROWN:   2,
  OPEN:    3,
  SMIRK:   4,
  OOO:     5,
  GRIN:    6,
};

const BROW = {
  NEUTRAL:  0,
  RAISED:   1,
  FURROWED: 2,
  WORRIED:  3,
};

const C = {
  WHITE:   0xFFFF,
  CYAN:    0x07FF,
  GREEN:   0x07E0,
  YELLOW:  0xFFE0,
  MAGENTA: 0xF81F,
  ORANGE:  0xFD20,
  BLUE:    0x001F,
  RED:     0xF800,
  PURPLE:  0x780F,
  TEAL:    0x0410,
  PINK:    0xFB56,
  LIME:    0x87E0,
  DIMBLUE: 0x10A2,  // deep, muted blue — used for nap/deep-sleep
  DIMGRAY: 0x39C7,  // dim slate — used for deep-sleep eyes
};

// ─────────────────────────────────────────────────────────────────
// Memory
// ─────────────────────────────────────────────────────────────────
const MEMORY_FILE = path.join(__dirname, "alex_memory.json");

let memory = {
  lastSeen:          Date.now(),   // last ESP poll (connectivity, not "activity")
  lastInteraction:   Date.now(),   // last REAL user action — drives sleep stages
  totalInteractions: 0,
  xp:                0,
  level:             1,
  achievements:      [],
  favoriteActivity:  "play",
  moodHistory:       [],
  consecutiveDays:   0,
  lastDailyReset:    new Date().toDateString(),
};

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const saved = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      memory = { ...memory, ...saved };
    }
  } catch (e) { console.error("Memory load error:", e.message); }
}

function saveMemory() {
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2)); }
  catch (e) { console.error("Memory save error:", e.message); }
}

// ─────────────────────────────────────────────────────────────────
// Time — IST
// ─────────────────────────────────────────────────────────────────
function getIST() {
  const utcMs = Date.now();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs);
}
function getISTHour()    { return getIST().getUTCHours(); }
function getISTMinutes() { return getIST().getUTCMinutes(); }

function getSchedulePeriod() {
  const h = getISTHour();
  if (h >= 23 || h <  5) return "SLEEPING";
  if (h >=  5 && h <  7) return "EARLY_MORNING";
  if (h >=  7 && h <  9) return "WAKING_UP";
  if (h >=  9 && h < 10) return "BREAKFAST";
  if (h >= 10 && h < 12) return "STUDY";
  if (h >= 12 && h < 14) return "LUNCH";
  if (h >= 14 && h < 17) return "PLAY";
  if (h >= 17 && h < 19) return "CREATIVE";
  if (h >= 19 && h < 21) return "EVENING";
  if (h >= 21 && h < 23) return "WIND_DOWN";
  return "IDLE";
}

// ─────────────────────────────────────────────────────────────────
// Lazy Companion & Sleep System  (feature #11)
// ─────────────────────────────────────────────────────────────────
const STAGE = {
  ACTIVE:     "ACTIVE",
  RELAXED:    "RELAXED",
  SLEEPY:     "SLEEPY",
  NAP:        "NAP",
  DEEP_SLEEP: "DEEP_SLEEP",
};

function minsSinceInteraction() {
  return (Date.now() - memory.lastInteraction) / 60000;
}

function getActivityStage() {
  // Nighttime schedule always wins — Alex is properly asleep at night.
  if (getSchedulePeriod() === "SLEEPING") return STAGE.DEEP_SLEEP;

  const m = minsSinceInteraction();
  if (m < 5)  return STAGE.ACTIVE;
  if (m < 15) return STAGE.RELAXED;
  if (m < 45) return STAGE.SLEEPY;
  if (m < 90) return STAGE.NAP;
  return STAGE.DEEP_SLEEP;
}

// Tracks whether Alex was asleep on the previous check, so we can
// detect the exact moment of waking up and fire a greeting/dream.
let wasAsleep = false;

function markInteraction() {
  const stageBefore = getActivityStage();
  const isWakingUp = wasAsleep || stageBefore === STAGE.SLEEPY ||
                      stageBefore === STAGE.NAP || stageBefore === STAGE.DEEP_SLEEP;

  memory.lastInteraction = Date.now();
  memory.lastSeen        = Date.now();
  wasAsleep = false;

  return isWakingUp;
}

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
  // ~45% chance to mention a dream instead of a plain greeting
  if (Math.random() < 0.45) return pick(DREAM_LINES);
  return pick(WAKE_LINES);
}

// Poll interval per stage — server decides, ESP just obeys.
function getPollIntervalForStage(stage) {
  switch (stage) {
    case STAGE.ACTIVE:     return randInt(2000, 5000);
    case STAGE.RELAXED:    return randInt(10000, 20000);
    case STAGE.SLEEPY:     return randInt(30000, 60000);
    case STAGE.NAP:        return randInt(120000, 300000);
    case STAGE.DEEP_SLEEP: return randInt(300000, 600000);
    default:               return 3000;
  }
}

// ─────────────────────────────────────────────────────────────────
// Emotion Engine
// ─────────────────────────────────────────────────────────────────
const emo = {
  happiness:  65, curiosity:  50, energy:     70,
  boredom:    10, excitement: 40, sleepiness: 15,
  confidence: 60,
};
const EMO_BASELINES = {
  happiness:  60, curiosity: 50, energy: 65,
  boredom:    15, excitement: 40,
  sleepiness: 20, confidence: 60,
};

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }
function nudge(key, delta) { emo[key] = clamp(emo[key] + delta); }

function tickEmotions() {
  const period = getSchedulePeriod();
  const h      = getISTHour();
  const stage  = getActivityStage();

  const isNight   = h >= 22 || h < 6;
  const isMorning = h >= 7  && h < 11;

  if (isNight)   { nudge("sleepiness", +0.9); nudge("energy", -0.5); nudge("excitement", -0.3); }
  else if (isMorning) { nudge("sleepiness", -0.7); nudge("energy", +0.5); }

  // Inactivity raises sleepiness/boredom too — stages feed the emotion engine,
  // not just the face generator, so mood history reflects laziness honestly.
  if (stage === STAGE.RELAXED)    { nudge("boredom", +0.3); nudge("energy", -0.1); }
  if (stage === STAGE.SLEEPY)     { nudge("sleepiness", +0.6); nudge("energy", -0.3); }
  if (stage === STAGE.NAP)        { nudge("sleepiness", +0.9); nudge("energy", -0.5); }
  if (stage === STAGE.DEEP_SLEEP) { nudge("sleepiness", +1.2); nudge("energy", -0.6); }

  const PFX = {
    SLEEPING:      { sleepiness: +1.0, energy: -0.4 },
    EARLY_MORNING: { sleepiness: +0.6, curiosity: +0.2 },
    WAKING_UP:     { sleepiness: -0.6, energy: +0.4 },
    BREAKFAST:     { happiness: +0.5,  energy: +0.4 },
    STUDY:         { curiosity: +0.6,  boredom: -0.2 },
    LUNCH:         { happiness: +0.4,  energy: +0.3 },
    PLAY:          { excitement: +0.7, boredom: -0.6, happiness: +0.3 },
    CREATIVE:      { curiosity: +0.5,  happiness: +0.3, confidence: +0.2 },
    EVENING:       { happiness: +0.2,  energy: -0.2 },
    WIND_DOWN:     { sleepiness: +0.5, energy: -0.4 },
  };
  const fx = PFX[period] || {};
  for (const [k, v] of Object.entries(fx)) nudge(k, v);

  for (const [k, base] of Object.entries(EMO_BASELINES)) {
    emo[k] = clamp(emo[k] + (base - emo[k]) * 0.015);
  }

  if (Date.now() % (5 * 60 * 1000) < 1100) {
    memory.moodHistory.push(getDominantEmotion());
    if (memory.moodHistory.length > 24) memory.moodHistory.shift();
  }
}

function getDominantEmotion() {
  const scored = { ...emo, sleepiness: emo.sleepiness * 1.3 };
  return Object.entries(scored).sort((a, b) => b[1] - a[1])[0][0];
}

// ─────────────────────────────────────────────────────────────────
// Expression Generator  — stage overrides come BEFORE emotion faces
// ─────────────────────────────────────────────────────────────────
function generateFaceState() {
  const period = getSchedulePeriod();
  const stage  = getActivityStage();
  const dominant = getDominantEmotion();

  // ── Hard override: nighttime / true deep sleep ──
  if (period === "SLEEPING" || stage === STAGE.DEEP_SLEEP) {
    return { el: EYE.CRESCENT, er: EYE.CRESCENT, ec: C.DIMGRAY,
             eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: true };
  }

  // ── Stage 3: Nap — crescent eyes + zzz, dim blue, occasional dream face ──
  if (stage === STAGE.NAP) {
    return { el: EYE.CRESCENT, er: EYE.CRESCENT, ec: C.DIMBLUE,
             eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: true };
  }

  // ── Stage 2: Sleepy — half-closed (squint) eyes, dimmer theme ──
  if (stage === STAGE.SLEEPY) {
    // Occasional "yawn" frame — mouth opens briefly along with text
    const yawning = rand() < 0.15;
    return { el: EYE.SQUINT, er: EYE.SQUINT, ec: C.PURPLE,
             eb: BROW.NEUTRAL, m: yawning ? MOUTH.OOO : MOUTH.NEUTRAL,
             bl: false, zzz: false };
  }

  // ── Stage 1: Relaxed — calmer eyes, slightly less expressive ──
  if (stage === STAGE.RELAXED) {
    return { el: EYE.ALMOND, er: EYE.ALMOND, ec: C.TEAL,
             eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: false };
  }

  // ── WAKING_UP override (existing behavior) ──
  if (period === "WAKING_UP" && emo.sleepiness > 50) {
    return { el: EYE.SQUINT, er: EYE.SQUINT, ec: C.YELLOW,
             eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: false };
  }

  // ── ACTIVE stage: full emotion-driven expressions (unchanged) ──
  const EMO_FACES = {
    sleepiness: { el: EYE.CRESCENT, er: EYE.CRESCENT, ec: C.PURPLE,
                  eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: emo.sleepiness > 60 },
    excitement: { el: EYE.WIDE,     er: EYE.WIDE,     ec: C.YELLOW,
                  eb: BROW.RAISED,  m: MOUTH.GRIN,    bl: false, zzz: false },
    happiness:  { el: EYE.ALMOND,   er: EYE.ALMOND,   ec: C.GREEN,
                  eb: BROW.RAISED,  m: MOUTH.SMILE,   bl: rand() < 0.25, zzz: false },
    curiosity:  { el: EYE.WIDE,     er: EYE.ALMOND,   ec: C.CYAN,
                  eb: BROW.RAISED,  m: MOUTH.OOO,     bl: false, zzz: false },
    boredom:    { el: EYE.SQUINT,   er: EYE.SQUINT,   ec: C.TEAL,
                  eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: false },
    energy:     { el: EYE.ROUND,    er: EYE.ROUND,    ec: C.LIME,
                  eb: BROW.RAISED,  m: MOUTH.SMILE,   bl: false, zzz: false },
    confidence: { el: EYE.ALMOND,   er: EYE.ALMOND,   ec: C.ORANGE,
                  eb: BROW.NEUTRAL, m: MOUTH.SMIRK,   bl: false, zzz: false },
  };

  if (emo.boredom > 70 && emo.energy < 30) {
    return { el: EYE.ANGRY, er: EYE.ANGRY, ec: C.RED,
             eb: BROW.FURROWED, m: MOUTH.FROWN, bl: false, zzz: false };
  }

  const PERIOD_FACES = {
    STUDY:    { el: EYE.ROUND,   er: EYE.SQUINT,  ec: C.CYAN,
                eb: BROW.FURROWED, m: MOUTH.NEUTRAL, bl: false, zzz: false },
    CREATIVE: { el: EYE.STAR,    er: EYE.STAR,    ec: C.MAGENTA,
                eb: BROW.RAISED,   m: MOUTH.SMILE,   bl: false, zzz: false },
    BREAKFAST:{ el: EYE.ALMOND,  er: EYE.ALMOND,  ec: C.ORANGE,
                eb: BROW.RAISED,   m: MOUTH.OPEN,    bl: false, zzz: false },
    LUNCH:    { el: EYE.ALMOND,  er: EYE.ALMOND,  ec: C.ORANGE,
                eb: BROW.RAISED,   m: MOUTH.OPEN,    bl: false, zzz: false },
    PLAY:     { el: EYE.WIDE,    er: EYE.WIDE,    ec: C.YELLOW,
                eb: BROW.RAISED,   m: MOUTH.GRIN,    bl: false, zzz: false },
    EVENING:  { el: EYE.ALMOND,  er: EYE.ALMOND,  ec: C.TEAL,
                eb: BROW.NEUTRAL,  m: MOUTH.SMILE,   bl: false, zzz: false },
    EARLY_MORNING: { el: EYE.HEART, er: EYE.HEART, ec: C.PINK,
                eb: BROW.NEUTRAL,  m: MOUTH.SMILE,   bl: true,  zzz: false },
  };

  if (PERIOD_FACES[period] && rand() < 0.40) return PERIOD_FACES[period];

  return EMO_FACES[dominant] || EMO_FACES.happiness;
}

// ─────────────────────────────────────────────────────────────────
// Dialogue System
// ─────────────────────────────────────────────────────────────────
const DIALOGUE = {
  SLEEPING:      ["zzz...", "...mmm...", "*dream noises*", "...nikhil...zzz", "zz..."],
  EARLY_MORNING: ["still sleepy...", "five more minutes...", "*yawn*", "not yet..."],
  WAKING_UP:     ["good morning!", "*stretches*", "yaaawn~", "is it morning already?", "need coffee..."],
  BREAKFAST:     ["breakfast time!", "nom nom nom~", "mmm, tasty!", "hungry!", "food!"],
  STUDY:         ["learning stuff!", "ooh interesting!", "hmm...", "taking notes...",
                  "did you know...", "complex...", "I got this.", "*thinking intensely*"],
  LUNCH:         ["lunchtime!", "so hungry!", "what are we eating?", "nom nom~", "eating..."],
  PLAY:          ["let's play!", "yay!", "catch me!", "woohoo!", "i'm winning!",
                  "best day ever!", "play with me!", "zoom zoom"],
  CREATIVE:      ["i made something!", "look what i drew!", "i have an idea!",
                  "creating...", "inventing...", "building something..."],
  EVENING:       ["how was your day?", "nice evening~", "relaxing...", "*stretches*",
                  "feeling peaceful", "cozy vibes"],
  WIND_DOWN:     ["getting sleepy...", "almost bedtime", "one more thing...", "yawn~",
                  "today was good"],
  IDLE:          ["hey there~", "boop!", "what's up?", "i missed you!",
                  "hello world", "hi!"],
};

// Stage-specific ambient lines (feature #11)
const STAGE_LINES = {
  RELAXED: ["i'm just relaxing.", "taking a small break.", "thinking quietly.", "calm mode~"],
  SLEEPY:  ["i'm feeling sleepy.", "maybe i'll take a little nap.", "*yawn* so sleepy...", "need coffee..."],
  NAP:     ["zzz...", "i'll wake up if you need me.", "...mmm...", "*soft breathing*"],
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
  visible:  false,
  content:  "",
  color:    C.WHITE,
  hideAt:   0,
  nextAt:   Date.now() + 5000,
};

function scheduleText(content, color = C.WHITE, durationMs = 0) {
  const dur = durationMs || (4000 + content.length * 80);
  textState.content = content.slice(0, 40);
  textState.color   = color;
  textState.visible = true;
  textState.hideAt  = Date.now() + dur;
}

function getContextualLine() {
  const period = getSchedulePeriod();
  const stage  = getActivityStage();

  // Stage-specific lines take priority once Alex is past ACTIVE/RELAXED.
  if (STAGE_LINES[stage]) return pick(STAGE_LINES[stage]);

  return pick(DIALOGUE[period] || DIALOGUE.IDLE);
}

// Ambient text frequency now depends on stage — the lazier Alex is,
// the less it talks, which is most of the CPU/network savings.
function tickText() {
  const now = Date.now();
  const stage = getActivityStage();

  if (textState.visible && now > textState.hideAt) {
    textState.visible = false;

    let gapMin, gapMax;
    switch (stage) {
      case STAGE.ACTIVE:     gapMin = 25000;  gapMax = 70000;   break;
      case STAGE.RELAXED:    gapMin = 60000;  gapMax = 120000;  break;
      case STAGE.SLEEPY:     gapMin = 90000;  gapMax = 180000;  break;
      case STAGE.NAP:        gapMin = 180000; gapMax = 360000;  break;
      case STAGE.DEEP_SLEEP: gapMin = 300000; gapMax = 600000;  break;
      default:               gapMin = 25000;  gapMax = 70000;
    }
    textState.nextAt = now + randInt(gapMin, gapMax);
  }

  if (!textState.visible && now > textState.nextAt) {
    // Even when the slot arrives, only actually speak half the time
    // while active — but ALWAYS speak (briefly) in sleep stages, since
    // those rare "zzz..." lines are the only signal Alex is alive.
    const speakChance = stage === STAGE.ACTIVE ? 0.5 : 0.85;
    if (rand() < speakChance) {
      const textColors = stage === STAGE.ACTIVE
        ? [C.WHITE, C.CYAN, C.YELLOW, C.GREEN, C.MAGENTA]
        : [C.DIMBLUE, C.PURPLE, C.TEAL];
      const dur = (stage === STAGE.ACTIVE) ? 0 : 3000; // shorter bubble while sleepy
      scheduleText(getContextualLine(), pick(textColors), dur);
    } else {
      textState.nextAt = now + randInt(15000, 30000);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// XP & Level
// ─────────────────────────────────────────────────────────────────
function awardXP(amount, reason = "") {
  memory.xp += amount;
  const newLevel = Math.floor(1 + Math.sqrt(memory.xp / 150));
  if (newLevel > memory.level) {
    memory.level = newLevel;
    scheduleText(`level ${memory.level}! 🎉`, C.YELLOW, 6000);
    nudge("happiness",  20);
    nudge("excitement", 30);
  }
  if (reason) console.log(`XP +${amount} (${reason}) → total ${memory.xp}`);
  saveMemory();
}

// ─────────────────────────────────────────────────────────────────
// Mini-Games
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
        awardXP(10, "rps win"); nudge("happiness", 5);
      } else {
        result = `i win! i had ${alex} hehe`;
        nudge("confidence", 8); nudge("excitement", 5);
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
        awardXP(bonus, "guess correct");
        nudge("excitement", 15);
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
function rand()           { return Math.random(); }
function randInt(lo, hi)  { return Math.floor(rand() * (hi - lo + 1)) + lo; }
function pick(arr)        { return arr[Math.floor(rand() * arr.length)]; }

// ─────────────────────────────────────────────────────────────────
// Daily streak check
// ─────────────────────────────────────────────────────────────────
function checkDailyStreak() {
  const today = getIST().toUTCString().slice(0, 16);
  if (memory.lastDailyReset !== today) {
    memory.consecutiveDays++;
    memory.lastDailyReset = today;
    if (memory.consecutiveDays > 1) {
      scheduleText(`day ${memory.consecutiveDays} together!`, C.YELLOW, 5000);
    }
    saveMemory();
  }
}

// ─────────────────────────────────────────────────────────────────
// Express Routes
// ─────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Alex Brain v2.1",
    status:  "online",
    period:  getSchedulePeriod(),
    stage:   getActivityStage(),
    dominant: getDominantEmotion(),
    level:   memory.level,
    xp:      memory.xp,
  });
});

// ── Main endpoint — polled by ESP, interval varies by stage ──────
// NOTE: this does NOT update memory.lastInteraction — polling is
// connectivity, not "activity". Only real interactions wake Alex.
app.get("/state", (req, res) => {
  memory.lastSeen = Date.now();
  memory.totalInteractions++;
  checkDailyStreak();

  const stage = getActivityStage();
  if (stage === STAGE.SLEEPY || stage === STAGE.NAP || stage === STAGE.DEEP_SLEEP) {
    wasAsleep = true;
  }

  const face = generateFaceState();

  res.json({
    el:  face.el, er:  face.er, ec:  face.ec, eb:  face.eb,
    m:   face.m,  bl:  face.bl, zzz: face.zzz,
    txt: textState.visible ? textState.content : "",
    tc:  textState.color,
    td:  textState.visible ? Math.max(0, textState.hideAt - Date.now()) : 0,
    pi:  getPollIntervalForStage(stage),
    act: getSchedulePeriod(),
    stg: stage,
    lvl: memory.level,
    xp:  memory.xp,
  });
});

// ── Button press / user interaction — this IS real activity ─────
app.post("/interact", (req, res) => {
  const isWakingUp = markInteraction();
  memory.totalInteractions++;

  nudge("happiness",  +10);
  nudge("boredom",    -15);
  nudge("excitement", +8);
  nudge("sleepiness", -20);
  awardXP(2, "button press");

  if (isWakingUp) {
    scheduleText(getWakeLine(), C.YELLOW, 4500);
  } else {
    const reactions = [
      "hey! you pressed me!", "ooh, interaction!", "hi hi hi!",
      "*happy noises*", "hello!!", "boop~", "you're here!", "yay!",
    ];
    scheduleText(pick(reactions), C.YELLOW, 4000);
  }

  res.json({ success: true, xp: memory.xp, level: memory.level, stage: getActivityStage() });
});

// ── Mini-game endpoint — also counts as real activity ────────────
app.post("/game", (req, res) => {
  const { game, action, value } = req.body;
  const isWakingUp = markInteraction();

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
  res.json({
    emotions: Object.fromEntries(Object.entries(emo).map(([k, v]) => [k, Math.round(v)])),
    dominant: getDominantEmotion(),
    period:   getSchedulePeriod(),
    stage:    getActivityStage(),
    minsSinceInteraction: Math.round(minsSinceInteraction()),
    hour_IST: getISTHour(),
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
loadMemory();
setInterval(tickEmotions, 1000);
setInterval(tickText, 500);
setInterval(saveMemory, 30000);

// World event burst — now also respects activity stage so it doesn't
// fire while Alex is supposed to be asleep.
setInterval(() => {
  const stage = getActivityStage();
  if (stage !== STAGE.ACTIVE && stage !== STAGE.RELAXED) return;
  if (rand() < 0.10) {
    scheduleText(pick(WORLD_EVENTS), C.PINK, 5000);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nAlex Brain v2.1  →  port ${PORT}`);
  console.log(`IST hour:       ${getISTHour()}:${String(getISTMinutes()).padStart(2,"0")}`);
  console.log(`Schedule:       ${getSchedulePeriod()}`);
  console.log(`Stage:          ${getActivityStage()}`);
  console.log(`Dominant emo:   ${getDominantEmotion()}`);
  console.log(`Memory level:   ${memory.level}  (${memory.xp} XP)\n`);
});