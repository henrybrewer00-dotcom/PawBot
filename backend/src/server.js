import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { store } from "./store.js";
import { createRouter } from "./routes.js";
import { runMedicationAgentTick } from "./domain.js";
import { runHyperspellSyncTick } from "./hyperspellSync.js";
import { startTensorlakeAgents } from "./tensorlakeRunner.js";
import { startScamScanner } from "./scamScanner.js";
import { isComposioConfigured } from "./composio.js";

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

// Vercel serverless — export the app, don't listen
if (process.env.VERCEL) {
  if (config.tensorlake.apiKey) {
    startTensorlakeAgents().catch((error) => {
      console.error("Tensorlake agent launch failed", error);
    });
  }
} else {
  app.listen(config.port, () => {
    console.log(`PawBot backend listening on http://localhost:${config.port}`);
    if (config.tensorlake.apiKey) {
      console.log("Medication agent running in Tensorlake");
    } else {
      console.log(`Medication agent polling every ${config.agent.pollSeconds}s`);
    }
    console.log(`Hyperspell sync polling every ${config.hyperspell.syncHours}h`);
  });

  if (config.tensorlake.apiKey) {
    startTensorlakeAgents().catch((error) => {
      console.error("Tensorlake agent launch failed", error);
    });
  } else {
    setInterval(() => {
      runMedicationAgentTick(store).catch((error) => {
        console.error("Medication agent tick failed", error);
      });
    }, config.agent.pollSeconds * 1000);
  }

  setInterval(() => {
    runHyperspellSyncTick(store).catch((error) => {
      console.error("Hyperspell sync tick failed", error);
    });
  }, config.hyperspell.syncHours * 60 * 60 * 1000);

  if (isComposioConfigured()) {
    startScamScanner();
    console.log("Scam scanner running every 5m via Composio + Grok");
  } else {
    console.log("Composio not configured — scam scanner idle (set COMPOSIO_API_KEY in backend/.env)");
  }
}

export default app;
