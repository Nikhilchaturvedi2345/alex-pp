/**
 * Alex Brain v2  —  Server-Centric Architecture
 *
 * The server IS Alex's brain. It owns:
 *   • Daily life-cycle schedule (IST timezone)
 *   • 7-axis emotion engine ticking every second
 *   • Expression generator (emotions + schedule → face state)
 *   • Dialogue pool + auto-scheduling text events
 *   • World events (things Alex "did" while you were away)
 *   • Memory persistence (interactions, XP, level, mood history)
 *   • Mini-games  (RPS, number guess)
 *
 * The ESP only asks  GET /state  every few seconds and renders
 * whatever this server says.  The ESP never makes a decision.
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
  ROUND:    0,   // classic round with pupil
  ALMOND:   1,   // anime-style narrow
  WIDE:     2,   // big circle, surprised
  SQUINT:   3,   // thin horizontal slice
  HEART:    4,   // heart-shaped
  X:        5,   // crossed out / error
  STAR:     6,   // star shape
  CRESCENT: 7,   // moon crescent / sleepy
  ANGRY:    8,   // slanted with hard edge
};

const MOUTH = {
  NEUTRAL: 0,
  SMILE:   1,
  FROWN:   2,
  OPEN:    3,   // oval, eating / surprised
  SMIRK:   4,   // asymmetric
  OOO:     5,   // small O
  GRIN:    6,   // wide with teeth strip
};

const BROW = {
  NEUTRAL:  0,
  RAISED:   1,
  FURROWED: 2,
  WORRIED:  3,
};

// RGB-565 values stored as integers
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
};

// ─────────────────────────────────────────────────────────────────
// Memory  (persisted to alex_memory.json)
// ─────────────────────────────────────────────────────────────────
const MEMORY_FILE = path.join(__dirname, "alex_memory.json");

let memory = {
  lastSeen:          Date.now(),
  totalInteractions: 0,
  xp:                0,
  level:             1,
  achievements:      [],
  favoriteActivity:  "play",
  moodHistory:       [],   // last 20 dominant emotions
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
// Time  —  Always work in IST (UTC +5:30)
// ─────────────────────────────────────────────────────────────────
function getIST() {
  const utcMs = Date.now();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs);
}

function getISTHour()    { return getIST().getUTCHours(); }
function getISTMinutes() { return getIST().getUTCMinutes(); }
function isWeekend()     { const d = getIST().getUTCDay(); return d === 0 || d === 6; }

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
// Emotion Engine  — 7 continuous axes, each 0–100
// ─────────────────────────────────────────────────────────────────
const emo = {
  happiness:  65,
  curiosity:  50,
  energy:     70,
  boredom:    10,
  excitement: 40,
  sleepiness: 15,
  confidence: 60,
};

const EMO_BASELINES = {
  happiness:  60, curiosity: 50, energy: 65,
  boredom:    15, excitement: 40,
  sleepiness: 20, confidence: 60,
};

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

function nudge(key, delta) {
  emo[key] = clamp(emo[key] + delta);
}

// Called every second by setInterval
function tickEmotions() {
  const period = getSchedulePeriod();
  const h      = getISTHour();
  const minsSinceSeen = (Date.now() - memory.lastSeen) / 60000;

  // ── Time-of-day drivers ──
  const isNight   = h >= 22 || h < 6;
  const isMorning = h >= 7  && h < 11;

  if (isNight) {
    nudge("sleepiness", +0.9);
    nudge("energy",     -0.5);
    nudge("excitement", -0.3);
  } else if (isMorning) {
    nudge("sleepiness", -0.7);
    nudge("energy",     +0.5);
  }

  // ── Inactivity drivers ──
  if (minsSinceSeen > 60) {
    nudge("boredom",   +0.4);
    nudge("happiness", -0.2);
  }
  if (minsSinceSeen > 180) {
    nudge("excitement", -0.3);
  }

  // ── Period-specific nudges ──
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

  // ── Slow mean-reversion toward baselines ──
  for (const [k, base] of Object.entries(EMO_BASELINES)) {
    emo[k] = clamp(emo[k] + (base - emo[k]) * 0.015);
  }

  // ── Record mood history every 5 minutes ──
  if (Date.now() % (5 * 60 * 1000) < 1100) {
    memory.moodHistory.push(getDominantEmotion());
    if (memory.moodHistory.length > 24) memory.moodHistory.shift();
  }
}

function getDominantEmotion() {
  // Weight sleepiness extra because it overrides everything at night
  const scored = { ...emo, sleepiness: emo.sleepiness * 1.3 };
  return Object.entries(scored).sort((a, b) => b[1] - a[1])[0][0];
}

// ─────────────────────────────────────────────────────────────────
// Expression Generator
// emotions + schedule period → compact face state object
// ─────────────────────────────────────────────────────────────────
function generateFaceState() {
  const period   = getSchedulePeriod();
  const dominant = getDominantEmotion();

  // ── Hard overrides ──
  if (period === "SLEEPING" || emo.sleepiness > 85) {
    return { el: EYE.CRESCENT, er: EYE.CRESCENT, ec: C.PURPLE,
             eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: true };
  }

  if (period === "WAKING_UP" && emo.sleepiness > 50) {
    return { el: EYE.SQUINT, er: EYE.SQUINT, ec: C.YELLOW,
             eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: false };
  }

  // ── Emotion-driven expressions ──
  const EMO_FACES = {
    sleepiness: { el: EYE.CRESCENT, er: EYE.CRESCENT, ec: C.PURPLE,
                  eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: emo.sleepiness > 60 },
    excitement: { el: EYE.WIDE,     er: EYE.WIDE,     ec: C.YELLOW,
                  eb: BROW.RAISED,  m: MOUTH.GRIN,    bl: false, zzz: false },
    happiness:  { el: EYE.ALMOND,   er: EYE.ALMOND,   ec: C.GREEN,
                  eb: BROW.RAISED,  m: MOUTH.SMILE,   bl: rand() < 0.25, zzz: false },
    curiosity:  { el: EYE.WIDE,     er: EYE.ALMOND,   ec: C.CYAN,    // asymmetric = curious
                  eb: BROW.RAISED,  m: MOUTH.OOO,     bl: false, zzz: false },
    boredom:    { el: EYE.SQUINT,   er: EYE.SQUINT,   ec: C.TEAL,
                  eb: BROW.NEUTRAL, m: MOUTH.NEUTRAL, bl: false, zzz: false },
    energy:     { el: EYE.ROUND,    er: EYE.ROUND,    ec: C.LIME,
                  eb: BROW.RAISED,  m: MOUTH.SMILE,   bl: false, zzz: false },
    confidence: { el: EYE.ALMOND,   er: EYE.ALMOND,   ec: C.ORANGE,
                  eb: BROW.NEUTRAL, m: MOUTH.SMIRK,   bl: false, zzz: false },
  };

  // Special grumpy combo: high boredom + low energy = annoyed
  if (emo.boredom > 70 && emo.energy < 30) {
    return { el: EYE.ANGRY, er: EYE.ANGRY, ec: C.RED,
             eb: BROW.FURROWED, m: MOUTH.FROWN, bl: false, zzz: false };
  }

  // ── Activity-period face overrides  (40 % chance) ──
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

const WORLD_EVENTS = [
  "i learned a new fact!",
  "i drew something cool",
  "i had a really weird dream",
  "i invented a new game",
  "i found an interesting book",
  "i practiced dancing alone",
  "i solved a tricky puzzle!",
  "i wrote a tiny poem",
  "i built something in my mind",
  "i discovered a new joke",
  "i counted to a million (almost)",
  "i figured out something big",
  "i had a great idea for us",
  "i reorganized my thoughts",
  "i made up a new word",
];

const ATTENTION_LINES = [
  "hey... you there?",
  "hello? *waves*",
  "i'm right here!",
  "don't forget about me~",
  "yoohoo!",
  "...nikhil?",
  "psst. hey.",
  "*taps screen*",
  "still here!",
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
  textState.content = content.slice(0, 40);   // ESP text buffer limit
  textState.color   = color;
  textState.visible = true;
  textState.hideAt  = Date.now() + dur;
}

function getContextualLine() {
  const period        = getSchedulePeriod();
  const minsSinceSeen = (Date.now() - memory.lastSeen) / 60000;

  // Long away → greeting
  if (minsSinceSeen > 120) {
    const hrs = Math.round(minsSinceSeen / 60);
    return `welcome back! gone ${hrs}h`;
  }
  if (minsSinceSeen > 30) {
    return pick(ATTENTION_LINES);
  }

  // Random world event burst
  if (rand() < 0.12) return pick(WORLD_EVENTS);

  return pick(DIALOGUE[period] || DIALOGUE.IDLE);
}

function tickText() {
  const now = Date.now();
  if (textState.visible && now > textState.hideAt) {
    textState.visible = false;
    textState.nextAt  = now + randInt(7000, 22000);
  }
  if (!textState.visible && now > textState.nextAt) {
    const textColors = [C.WHITE, C.CYAN, C.YELLOW, C.GREEN, C.MAGENTA];
    scheduleText(getContextualLine(), pick(textColors));
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
    start() {
      activeGame = { type: "rps" };
      return "rock paper scissors! pick";
    },
    move(choice) {
      const alex = pick(this.choices);
      const wins = { rock: "scissors", paper: "rock", scissors: "paper" };
      let result;
      if (choice === alex) {
        result = `tie! we both picked ${alex}`;
      } else if (wins[choice] === alex) {
        result = `you win! i had ${alex}`;
        awardXP(10, "rps win");
        nudge("happiness", 5);
      } else {
        result = `i win! i had ${alex} hehe`;
        nudge("confidence", 8);
        nudge("excitement", 5);
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
function rand()            { return Math.random(); }
function randInt(lo, hi)   { return Math.floor(rand() * (hi - lo + 1)) + lo; }
function pick(arr)         { return arr[Math.floor(rand() * arr.length)]; }

// ─────────────────────────────────────────────────────────────────
// Poll Interval  —  save ESP power during sleep periods
// ─────────────────────────────────────────────────────────────────
function getPollInterval() {
  const period = getSchedulePeriod();
  if (period === "SLEEPING") return 10000;   // Alex is asleep, ESP can rest more
  if (period === "WIND_DOWN") return 5000;
  return 2500;                                // active periods: refresh fast
}

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
    service: "Alex Brain v2",
    status:  "online",
    period:  getSchedulePeriod(),
    dominant: getDominantEmotion(),
    level:   memory.level,
    xp:      memory.xp,
  });
});

// ── Main endpoint — polled by ESP every ~2.5 s ───────────────────
app.get("/state", (req, res) => {
  memory.lastSeen = Date.now();
  memory.totalInteractions++;
  checkDailyStreak();

  const face = generateFaceState();

  res.json({
    // Face state
    el:  face.el,
    er:  face.er,
    ec:  face.ec,
    eb:  face.eb,
    m:   face.m,
    bl:  face.bl,
    zzz: face.zzz,
    // Text overlay
    txt: textState.visible ? textState.content : "",
    tc:  textState.color,
    td:  textState.visible ? Math.max(0, textState.hideAt - Date.now()) : 0,
    // Metadata
    pi:  getPollInterval(),
    act: getSchedulePeriod(),
    lvl: memory.level,
    xp:  memory.xp,
  });
});

// ── Button press / user interaction ─────────────────────────────
app.post("/interact", (req, res) => {
  memory.lastSeen          = Date.now();
  memory.totalInteractions++;

  nudge("happiness",  +10);
  nudge("boredom",    -15);
  nudge("excitement", +8);
  awardXP(2, "button press");

  const reactions = [
    "hey! you pressed me!", "ooh, interaction!",
    "hi hi hi!", "*happy noises*",
    "hello!!",   "boop~",
    "you're here!", "yay!",
  ];
  scheduleText(pick(reactions), C.YELLOW, 4000);

  res.json({ success: true, xp: memory.xp, level: memory.level });
});

// ── Mini-game endpoint ───────────────────────────────────────────
app.post("/game", (req, res) => {
  const { game, action, value } = req.body;

  if (action === "start") {
    if (!GAMES[game]) return res.json({ success: false, msg: "unknown game" });
    const msg = GAMES[game].start();
    scheduleText(msg, C.CYAN, 9000);
    return res.json({ success: true, msg });
  }

  if (action === "move" && activeGame) {
    const result = GAMES[activeGame.type].move(String(value));
    scheduleText(result, C.GREEN, 5000);
    return res.json({ success: true, msg: result });
  }

  return res.json({ success: false, msg: "no active game" });
});

// ── Emotions debug dump ──────────────────────────────────────────
app.get("/emotions", (req, res) => {
  res.json({
    emotions: Object.fromEntries(
      Object.entries(emo).map(([k, v]) => [k, Math.round(v)])
    ),
    dominant: getDominantEmotion(),
    period:   getSchedulePeriod(),
    hour_IST: getISTHour(),
    memory: {
      level:    memory.level,
      xp:       memory.xp,
      lastSeen: new Date(memory.lastSeen).toISOString(),
      streak:   memory.consecutiveDays,
    },
  });
});

// ─────────────────────────────────────────────────────────────────
// Engine Ticks
// ─────────────────────────────────────────────────────────────────
loadMemory();
setInterval(tickEmotions, 1000);     // emotion engine: every second
setInterval(tickText, 500);           // text scheduler: every 500 ms
setInterval(saveMemory, 30000);       // persist memory: every 30 s

// World event: random chance once per minute Alex "did something"
setInterval(() => {
  if (rand() < 0.25) {
    scheduleText(pick(WORLD_EVENTS), C.PINK, 5000);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nAlex Brain v2  →  port ${PORT}`);
  console.log(`IST hour:       ${getISTHour()}:${String(getISTMinutes()).padStart(2,"0")}`);
  console.log(`Schedule:       ${getSchedulePeriod()}`);
  console.log(`Dominant emo:   ${getDominantEmotion()}`);
  console.log(`Memory level:   ${memory.level}  (${memory.xp} XP)\n`);
});