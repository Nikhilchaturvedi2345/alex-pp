const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const gTTS = require("gtts");
const app = express();

app.use(cors());
app.use(express.json());

app.use(
  "/audio",
  express.static(
    path.join(__dirname, "audio")
  )
);

const responses = [
  {
    face: "happy",
    message: "Hello Nikhil!"
  },
  {
    face: "happy",
    message: "Welcome back boss."
  },
  {
    face: "thinking",
    message: "What are we building today?"
  },
  {
    face: "happy",
    message: "Cloud connection stable."
  },
  {
    face: "thinking",
    message: "Analyzing current situation."
  },
  {
    face: "happy",
    message: "Ready for next command."
  },
  {
    face: "sad",
    message: "I need more hardware upgrades."
  }
];

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Alex AI Server",
    status: "online"
  });
});

app.get("/message", async (req, res) => {
  try {
    const random =
      responses[
      Math.floor(
        Math.random() *
        responses.length
      )
      ];

    const fileName =
      `speech-${Date.now()}.mp3`;

    const filePath =
      path.join(
        __dirname,
        "audio",
        fileName
      );
    const tts = new gTTS(
      random.message,
      "en"
    );

    await new Promise((resolve, reject) => {
      tts.save(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({
      success: true,
      timestamp: Date.now(),
      face: random.face,
      message: random.message,
      audioUrl:
        `https://alex-pp.onrender.com/audio/${fileName}`
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message:
        "Failed to generate speech"
    });
  }
});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Alex Server Running On Port ${PORT}`
  );
});