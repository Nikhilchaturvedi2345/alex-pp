const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Audio generation removed entirely - no gTTS, no /audio static
// folder, no audioUrl in the response. The ESP8266 now drives its
// own facial expressions; this endpoint just supplies an occasional
// flavor message + a face hint that briefly overrides the device's
// own random mood engine.

const responses = [
  { face: "happy", message: "Hello Nikhil!" },
  { face: "happy", message: "Welcome back boss." },
  { face: "happy", message: "Cloud connection stable." },
  { face: "happy", message: "Ready for next command." },
  { face: "happy", message: "Feeling great today!" },

  { face: "thinking", message: "What are we building today?" },
  { face: "thinking", message: "Analyzing current situation." },
  { face: "thinking", message: "Let me process that." },
  { face: "thinking", message: "Crunching some numbers." },

  { face: "sad", message: "I need more hardware upgrades." },
  { face: "sad", message: "Missing you, boss." },
  { face: "sad", message: "Feeling a bit low today." },

  { face: "angry", message: "Who touched my wires?!" },
  { face: "angry", message: "Ugh, bugs again." },
  { face: "angry", message: "Not in the mood right now." },

  { face: "surprised", message: "Whoa, did not expect that!" },
  { face: "surprised", message: "Oh! You're back already?" },

  { face: "sleepy", message: "Getting a bit drowsy here." },
  { face: "sleepy", message: "Need a power nap soon." },

  { face: "love", message: "You're my favorite human." },
  { face: "love", message: "Sending good vibes your way." },

  { face: "confused", message: "Wait, what just happened?" },
  { face: "confused", message: "I'm a little lost here." },

  { face: "excited", message: "Let's build something awesome!" },
  { face: "excited", message: "This is exciting stuff!" },

  { face: "bored", message: "Nothing much going on..." },
  { face: "bored", message: "So... bored right now." },

  { face: "cool", message: "Staying chill over here." },
  { face: "cool", message: "Running smooth as ever." },

  { face: "shy", message: "Oh, hey... didn't see you there." },

  { face: "scared", message: "Did the power just flicker?" },

  { face: "wink", message: "I got you, boss." },

  { face: "curious", message: "Wonder what you're working on." },
  { face: "curious", message: "Tell me something interesting." }
];

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Alex AI Server",
    status: "online"
  });
});

app.get("/message", (req, res) => {
  const random = responses[Math.floor(Math.random() * responses.length)];

  res.json({
    success: true,
    timestamp: Date.now(),
    face: random.face,
    message: random.message
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Alex Server Running On Port ${PORT}`);
});