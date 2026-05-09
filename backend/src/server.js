import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { store } from "./store.js";
import { createRouter } from "./routes.js";
import { runMedicationAgentTick } from "./domain.js";
import { runHyperspellSyncTick } from "./hyperspellSync.js";

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
  console.log(`Hyperspell sync polling every ${config.hyperspell.syncHours}h`);
});

setInterval(() => {
  runMedicationAgentTick(store).catch((error) => {
    console.error("Medication agent tick failed", error);
  });
}, config.agent.pollSeconds * 1000);

setInterval(() => {
  runHyperspellSyncTick(store).catch((error) => {
    console.error("Hyperspell sync tick failed", error);
  });
}, config.hyperspell.syncHours * 60 * 60 * 1000);
