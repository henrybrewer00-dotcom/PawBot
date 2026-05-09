import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { store } from "./store.js";
import { createRouter } from "./routes.js";
import { runMedicationAgentTick } from "./domain.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(createRouter(store));

app.use((error, req, res, next) => {
  const status = error.status ?? 500;
  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: error.message ?? "Unexpected server error"
  });
});

app.listen(config.port, () => {
  console.log(`PawBot backend listening on http://localhost:${config.port}`);
  console.log(`Medication agent polling every ${config.agent.pollSeconds}s`);
});

setInterval(() => {
  runMedicationAgentTick(store).catch((error) => {
    console.error("Medication agent tick failed", error);
  });
}, config.agent.pollSeconds * 1000);
