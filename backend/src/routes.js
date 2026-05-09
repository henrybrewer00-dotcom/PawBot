import express from "express";
import { asyncHandler, HttpError, requireFields } from "./http.js";
import { config } from "./config.js";
import { runCalendarReminderAgent } from "./calendarReminder.js";
import { runDailySummaryAgent } from "./dailySummary.js";
import {
  createCalendarEvent,
  createMedication,
  createMedicationLog,
  createScamAlert,
  createUser,
  escalateMissedMedication,
  getMedicationsForSenior,
  getTodayMedicationStatus,
  getUpcomingCalendarEvents,
  handleIncomingTextReply,
  linkCaretakerToSenior,
  markMedicationTaken,
  runMedicationAgentTick,
  sendMedicationReminder,
  updateMedication
} from "./domain.js";
import { searchSeniorMemory } from "./nia.js";
import { createUserToken, getConnectUrl, HYPERSPELL_PROVIDERS } from "./hyperspell.js";
import {
  recordHyperspellConnection,
  runHyperspellSyncTick,
  scanEmailsForScams,
  syncCalendarEvents,
  syncProvider
} from "./hyperspellSync.js";

function requireHyperspellProvider(provider) {
  if (!HYPERSPELL_PROVIDERS.has(provider)) {
    throw new HttpError(400, "provider must be google_calendar or google_mail");
  }
}

function requireAgentAuth(req) {
  const expected = config.agentAuthToken;
  const actual = req.get("authorization") ?? "";
  if (!expected || actual !== `Bearer ${expected}`) {
    throw new HttpError(401, "Unauthorized agent request");
  }
}

export function createRouter(store) {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({ ok: true, service: "pawbot-backend" });
  });

  router.post("/api/seniors", (req, res) => {
    requireFields(req.body, ["name", "phone", "email"]);
    res.status(201).json(createUser(store, { ...req.body, role: "senior" }));
  });

  router.post("/api/caretakers", (req, res) => {
    requireFields(req.body, ["name", "phone", "email"]);
    res.status(201).json(createUser(store, { ...req.body, role: "caretaker" }));
  });

  router.post("/api/care-relationships", (req, res) => {
    requireFields(req.body, ["caretakerId", "seniorId"]);
    res.status(201).json(linkCaretakerToSenior(store, req.body));
  });

  router.post("/api/medications", (req, res) => {
    requireFields(req.body, ["seniorId", "createdBy", "name", "dosage", "times"]);
    res.status(201).json(createMedication(store, req.body));
  });

  router.patch("/api/medications/:id", (req, res) => {
    res.json(updateMedication(store, req.params.id, req.body));
  });

  router.get("/api/seniors/:seniorId/medications", (req, res) => {
    res.json(getMedicationsForSenior(store, req.params.seniorId));
  });

  router.post("/api/medication-logs", (req, res) => {
    requireFields(req.body, ["medicationId", "seniorId", "scheduledFor"]);
    res.status(201).json(createMedicationLog(store, req.body));
  });

  router.post("/api/medication-logs/:id/taken", (req, res) => {
    res.json(markMedicationTaken(store, req.params.id, req.body.replyText));
  });

  router.get("/api/seniors/:seniorId/medication-status/today", (req, res) => {
    res.json(getTodayMedicationStatus(store, req.params.seniorId));
  });

  router.post("/api/medication-logs/:id/send-reminder", asyncHandler(async (req, res) => {
    res.json(await sendMedicationReminder(store, req.params.id));
  }));

  router.post("/api/medication-logs/:id/escalate", asyncHandler(async (req, res) => {
    res.json(await escalateMissedMedication(store, req.params.id));
  }));

  router.post("/api/calendar-events", (req, res) => {
    requireFields(req.body, ["seniorId", "createdBy", "title", "date"]);
    res.status(201).json(createCalendarEvent(store, req.body));
  });

  router.get("/api/seniors/:seniorId/calendar-events/upcoming", (req, res) => {
    res.json(getUpcomingCalendarEvents(store, req.params.seniorId));
  });

  router.post("/api/scam-alerts", (req, res) => {
    requireFields(req.body, ["seniorId", "source", "riskLevel", "summary"]);
    res.status(201).json(createScamAlert(store, req.body));
  });

  router.get("/api/seniors/:seniorId/agent-logs", (req, res) => {
    const logs = store
      .all("agentLogs")
      .filter((log) => log.seniorId === req.params.seniorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(logs);
  });

  router.get("/api/seniors/:seniorId/memory/search", asyncHandler(async (req, res) => {
    const query = String(req.query.q ?? "").trim();
    if (!query) {
      res.status(400).json({ error: "q query parameter is required" });
      return;
    }
    const results = await searchSeniorMemory(req.params.seniorId, query);
    res.json({ query, results });
  }));

  router.post("/api/seniors/:seniorId/hyperspell/connect", asyncHandler(async (req, res) => {
    requireFields(req.body, ["provider"]);
    requireHyperspellProvider(req.body.provider);

    const redirectUrl = req.body.redirectUrl ?? `${config.hyperspell.publicBaseUrl}/webhooks/hyperspell/connected`;
    const userToken = await createUserToken(req.params.seniorId);
    const connect = await getConnectUrl(req.params.seniorId, req.body.provider, redirectUrl, userToken);
    res.json(connect ?? { url: null, expires_at: null });
  }));

  router.get("/api/seniors/:seniorId/hyperspell/connections", (req, res) => {
    const connections = store
      .all("hyperspellConnections")
      .filter((connection) => connection.seniorId === req.params.seniorId);
    res.json(connections);
  });

  router.post("/api/seniors/:seniorId/hyperspell/sync", asyncHandler(async (req, res) => {
    const calendarEvents = await syncCalendarEvents(store, req.params.seniorId);
    const scamAlerts = await scanEmailsForScams(store, req.params.seniorId);
    res.json({ calendarEvents: calendarEvents.length, scamAlerts: scamAlerts.length });
  }));

  router.post("/api/agent/tick", asyncHandler(async (req, res) => {
    const results = await runMedicationAgentTick(store);
    res.json({ ran: true, actions: results.length, results });
  }));

  router.post("/api/agents/medication-tick", asyncHandler(async (req, res) => {
    requireAgentAuth(req);
    const results = await runMedicationAgentTick(store);
    res.json({ ran: true, actions: results.length, results });
  }));

  router.post("/api/agents/hyperspell-sync", asyncHandler(async (req, res) => {
    requireAgentAuth(req);
    const results = await runHyperspellSyncTick(store);
    res.json({ ran: true, results });
  }));

  router.post("/api/agents/calendar-reminders", asyncHandler(async (req, res) => {
    requireAgentAuth(req);
    const reminders = await runCalendarReminderAgent(store);
    res.json({ reminded: reminders.length, reminders });
  }));

  router.post("/api/agents/daily-summary", asyncHandler(async (req, res) => {
    requireAgentAuth(req);
    const summaries = await runDailySummaryAgent(store);
    res.json({
      summariesSent: summaries.reduce((total, summary) => total + summary.summariesSent, 0),
      summaries
    });
  }));

  router.post("/webhooks/sendblue/inbound", asyncHandler(async (req, res) => {
    res.json(await handleIncomingTextReply(store, req.body));
  }));

  router.post("/webhooks/sendblue/status", (req, res) => {
    res.json({ ok: true });
  });

  router.post("/webhooks/hyperspell/connected", asyncHandler(async (req, res) => {
    requireFields(req.body, ["seniorId", "provider"]);
    requireHyperspellProvider(req.body.provider);

    const connection = recordHyperspellConnection(store, req.body);
    const synced = await syncProvider(store, req.body.seniorId, req.body.provider);
    res.json({ connection, synced });
  }));

  return router;
}
