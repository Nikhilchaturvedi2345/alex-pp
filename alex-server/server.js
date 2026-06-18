const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

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

app.get("/message", (req, res) => {

  const random =
    responses[
      Math.floor(
        Math.random() *
        responses.length
      )
    ];

  res.json({
    success: true,
    timestamp: Date.now(),
    face: random.face,
    message: random.message
  });
});

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Alex Server Running On Port ${PORT}`
  );
});