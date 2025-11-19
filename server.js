import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const TARGET = "https://safety360-backend.onrender.com";

// Debug: Root endpoint
app.get("/", (req, res) => {
  res.json({ status: "Proxy läuft!", target: TARGET });
});

// Proxy für alle Backend-Requests
app.use("/api", async (req, res) => {
  const url = TARGET + req.url.replace("/api", "");

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.text();

    res.status(response.status).send(data);
  } catch (err) {
    console.error("Proxy-Fehler:", err);
    res.status(500).json({ error: "Proxy konnte API nicht erreichen" });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy läuft auf Port ${PORT}`);
});
