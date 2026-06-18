const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

const messages = [
  "Hello Nikhil!",
  "Jarvis Online",
  "Keep Building Cool Stuff",
  "IoT Mode Activated",
  "Welcome Back Boss",
  "Ready For Next Command",
  "System Running Smoothly",
  "Cloud Connection Active"
];

app.get("/message", (req, res) => {

  const randomMessage =
    messages[Math.floor(Math.random() * messages.length)];

  res.send(randomMessage);

});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Alex Server Running on ${PORT}`);
});