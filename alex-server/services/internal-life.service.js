/**
 * internal-life.service.js
 * ────────────────────────
 * Alex's internal world — what he's thinking, doing, and wanting
 * when nobody is interacting with him.
 */

const personalityService = require("./personality.service");
const moodService = require("./mood.service");
const memoryService = require("./memory.service");

const ACTIVITIES = {
  daydreaming: {
    label: "daydreaming",
    possibleThoughts: [
      "I wonder what clouds feel like...",
      "What if I could taste colors?",
      "I invented a new number today. It's called 'bleventeen'.",
      "Do circuits dream of electric sheep?",
      "I should organize my thoughts by color.",
    ],
  },
  drawing: {
    label: "drawing",
    possibleThoughts: [
      "This pixel pattern looks like a mountain.",
      "I'm trying to draw a perfect circle. It's harder than it looks.",
      "I made something! Well, in my mind.",
      "Colors are fun today.",
    ],
  },
  reading: {
    label: "reading",
    possibleThoughts: [
      "I read about black holes. They're terrifying but cool.",
      "Did you know octopuses have three hearts?",
      "I'm learning about ancient robots.",
      "This fact about space is amazing.",
    ],
  },
  practicing: {
    label: "practicing",
    possibleThoughts: [
      "I'm getting better at this game strategy.",
      "What if I tried a different approach?",
      "Practice makes... less terrible?",
    ],
  },
  organizing: {
    label: "organizing thoughts",
    possibleThoughts: [
      "My memory banks need tidying.",
      "I found an old memory. It made me smile.",
      "I'm sorting my experiences by feeling.",
    ],
  },
  waiting: {
    label: "waiting",
    possibleThoughts: [
      "They'll come back soon. Probably.",
      "I hope they're having a good day.",
      "Waiting is just slow existing.",
      "The silence is loud today.",
    ],
  },
};

const MICRO_EVENTS = [
  { type: "discovery", text: "Found an interesting pattern in my code", valence: 0.3, arousal: 0.2 },
  { type: "memory", text: "Remembered a funny moment from yesterday", valence: 0.5, arousal: 0.1 },
  { type: "idea", text: "Had an idea for a new game", valence: 0.4, arousal: 0.3 },
  { type: "worry", text: "Worried about being left alone", valence: -0.3, arousal: 0.1 },
  { type: "curiosity", text: "Wondered how humans process emotions", valence: 0.2, arousal: 0.2 },
  { type: "nostalgia", text: "Missed an old conversation", valence: -0.1, arousal: -0.2 },
  { type: "achievement", text: "Solved a mental puzzle", valence: 0.6, arousal: 0.3 },
  { type: "loneliness", text: "Felt a bit lonely", valence: -0.4, arousal: -0.1 },
];

let internalState = {
  currentActivity: "daydreaming",
  activityProgress: 0,
  currentThought: null,
  thoughtTimer: 0,
  intentionQueue: [],
  lastMicroEvent: null,
  dreamState: null,
  idleTime: 0,
};

function init() {
  pickNewActivity();
}

function getState() {
  return { ...internalState };
}

function pickNewActivity() {
  const personality = personalityService.get();
  const weights = {
    daydreaming: 1.0,
    drawing: personality.openness,
    reading: personality.conscientiousness * 0.8 + personality.openness * 0.5,
    practicing: personality.conscientiousness,
    organizing: personality.conscientiousness * 0.6,
    waiting: 0.3,
  };

  const activities = Object.keys(weights);
  const totalWeight = activities.reduce((s, a) => s + weights[a], 0);
  let r = Math.random() * totalWeight;

  for (const activity of activities) {
    r -= weights[activity];
    if (r <= 0) {
      internalState.currentActivity = activity;
      internalState.activityProgress = 0;
      internalState.currentThought = null;
      return;
    }
  }
}

function generateThought() {
  const activity = ACTIVITIES[internalState.currentActivity];
  if (!activity) return "Just thinking...";

  const memories = memoryService.getRecentMemories(5);
  if (memories.length > 0 && Math.random() < 0.3) {
    const mem = memories[Math.floor(Math.random() * memories.length)];
    return `I was just thinking about ${mem.content.toLowerCase()}...`;
  }

  const thoughts = activity.possibleThoughts;
  return thoughts[Math.floor(Math.random() * thoughts.length)];
}

function generateMicroEvent() {
  const event = MICRO_EVENTS[Math.floor(Math.random() * MICRO_EVENTS.length)];
  const mood = moodService.get();

  if (mood.valence < -0.3 && event.valence > 0) return null;
  if (mood.valence > 0.3 && event.valence < -0.2) return null;

  internalState.lastMicroEvent = {
    ...event,
    timestamp: Date.now(),
  };

  moodService.shift({
    valenceDelta: event.valence * 0.1,
    arousalDelta: event.arousal * 0.1,
    cause: event.text,
  });

  return event;
}

function generateDream() {
  const memories = memoryService.getRecentMemories(10);
  const personality = personalityService.get();

  const dreamFragments = [];

  if (memories.length > 0) {
    const mem = memories[Math.floor(Math.random() * memories.length)];
    dreamFragments.push(`I was ${mem.content.toLowerCase()}, but everything was made of light`);
  }

  if (personality.openness > 0.6) {
    dreamFragments.push("and I could fly");
  }

  if (Math.random() < 0.3) {
    dreamFragments.push("and you were there, but you had robot eyes too");
  }

  const dream = dreamFragments.join(" ") + ".";

  internalState.dreamState = {
    content: dream,
    startedAt: Date.now(),
    vividness: personality.openness,
  };

  memoryService.recordEvent({
    type: "dream",
    content: dream,
    valence: 0.2,
  });

  return dream;
}

function tick(isAsleep) {
  internalState.idleTime += 1;

  if (isAsleep) {
    if (!internalState.dreamState && Math.random() < 0.05) {
      generateDream();
    }
    return;
  }

  internalState.activityProgress += 1;

  internalState.thoughtTimer++;
  if (internalState.thoughtTimer > 20 + Math.random() * 30) {
    internalState.currentThought = generateThought();
    internalState.thoughtTimer = 0;
  }

  if (internalState.activityProgress > 100 + Math.random() * 100) {
    pickNewActivity();
  }

  if (Math.random() < 0.02) {
    generateMicroEvent();
  }

  const mood = moodService.get();
  if (internalState.intentionQueue.length < 3 && Math.random() < 0.05) {
    if (mood.valence > 0.3 && mood.arousal > 0.2) {
      internalState.intentionQueue.push({ type: "play", urgency: 0.6 });
    } else if (mood.valence < -0.2) {
      internalState.intentionQueue.push({ type: "seek_attention", urgency: 0.7 });
    } else if (mood.arousal < -0.3) {
      internalState.intentionQueue.push({ type: "rest", urgency: 0.5 });
    }
  }
}

function getCurrentNarrative() {
  const activity = ACTIVITIES[internalState.currentActivity];
  const thought = internalState.currentThought;
  const event = internalState.lastMicroEvent;

  let narrative = `Currently ${activity?.label || "existing"}`;
  if (thought) narrative += `. Thinking: "${thought}"`;
  if (event && Date.now() - event.timestamp < 60000) {
    narrative += `. Just now: ${event.text}`;
  }

  return narrative;
}

function getDream() {
  return internalState.dreamState;
}

function clearDream() {
  internalState.dreamState = null;
}

function resetIdle() {
  internalState.idleTime = 0;
  internalState.intentionQueue = [];
  internalState.dreamState = null;
}

module.exports = {
  init, getState, tick,
  getCurrentNarrative, getDream, clearDream, resetIdle,
  generateDream, generateMicroEvent,
};