import express from "express";
import { requireInsForgeUser } from "./auth.js";
import { asyncHandler, HttpError, requireFields } from "./http.js";
import { normalizeLookupIdentifier } from "./identity.js";
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
  getAccountProfile,
  getMedicationsForSenior,
  getScamAlertsForSenior,
  getSeniorPersonalInfo,
  getTodayMedicationStatus,
  getUpcomingCalendarEvents,
  handleIncomingTextReply,
  linkCaretakerToSenior,
  markMedicationTaken,
  runMedicationAgentTick,
  sendMedicationReminder,
  upsertSeniorForLink,
  upsertSeniorPersonalInfo,
  upsertAccountProfile,
  updateMedication
} from "./domain.js";
import { searchSeniorMemory } from "./nia.js";
import { fetchGmailRecent, fetchCalendarUpcoming, isComposioConfigured, probeRaw } from "./composio.js";
import { listScamAlerts, dismissScamAlert, scannerStatus } from "./scamScanner.js";
import { generateMorningBrief, getCachedMorningBrief, listMorningBriefs } from "./morningBrief.js";
import { enqueueTask as enqueueBrowserTask, claimNextTask as claimNextBrowserTask, recordResult as recordBrowserResult, getResult as getBrowserResult, waitForResult as waitForBrowserResult } from "./browserBridge.js";
import { listSiteAccounts, getSiteAccount, recordSiteAccount, deleteSiteAccount } from "./siteAccounts.js";
import { createUserToken, getConnectUrl, HYPERSPELL_PROVIDERS } from "./hyperspell.js";
import {
  normalizeHyperspellProvider,
  refreshHyperspellConnections,
  recordHyperspellConnection,
  runEmailSummaryAgent,
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

  router.get("/api/me/profile", asyncHandler(async (req, res) => {
    const authUser = await requireInsForgeUser(req);
    res.json({ profile: await getAccountProfile(store, authUser) });
  }));

  router.post("/api/me/profile", asyncHandler(async (req, res) => {
    const authUser = await requireInsForgeUser(req);
    requireFields(req.body, ["role", "name", "phone"]);
    res.status(201).json({ profile: await upsertAccountProfile(store, authUser, req.body) });
  }));

  router.post("/api/me/link-senior", asyncHandler(async (req, res) => {
    const authUser = await requireInsForgeUser(req);
    const profile = await getAccountProfile(store, authUser);
    if (!profile?.account) throw new HttpError(404, "Account profile not found");
    if (profile.account.role !== "caretaker") {
      throw new HttpError(403, "Only caretaker accounts can link seniors");
    }

    const needle = normalizeLookupIdentifier(req.body?.identifier ?? req.body?.seniorId ?? req.body?.email ?? req.body?.phone ?? "");
    if (!needle) {
      throw new HttpError(400, "identifier, seniorId, email, or phone is required");
    }

    const senior = await upsertSeniorForLink(store, needle, profile.account.timezone);

    const already = (await store.all("careRelationships")).find(
      (r) => r.caretakerId === profile.account.id && r.seniorId === senior.id
    );
    if (already) throw new HttpError(409, "This senior is already linked to your account");

    await linkCaretakerToSenior(store, { caretakerId: profile.account.id, seniorId: senior.id });

    res.status(201).json({
      senior,
      profile: await getAccountProfile(store, authUser)
    });
  }));

  router.post("/api/me/seniors", asyncHandler(async (req, res) => {
    const authUser = await requireInsForgeUser(req);
    const profile = await getAccountProfile(store, authUser);
    if (!profile?.account) throw new HttpError(404, "Account profile not found");
    if (profile.account.role !== "caretaker") {
      throw new HttpError(403, "Only caretaker accounts can create senior profiles");
    }

    requireFields(req.body, ["name", "phone", "email"]);
    const senior = await createUser(store, {
      ...req.body,
      role: "senior",
      timezone: req.body.timezone ?? profile.account.timezone
    });
    await linkCaretakerToSenior(store, {
      caretakerId: profile.account.id,
      seniorId: senior.id
    });

    res.status(201).json({
      senior,
      profile: await getAccountProfile(store, authUser)
    });
  }));

  router.post("/api/seniors", asyncHandler(async (req, res) => {
    requireFields(req.body, ["name", "phone", "email"]);
    res.status(201).json(await createUser(store, { ...req.body, role: "senior" }));
  }));

  router.post("/api/caretakers", asyncHandler(async (req, res) => {
    requireFields(req.body, ["name", "phone", "email"]);
    res.status(201).json(await createUser(store, { ...req.body, role: "caretaker" }));
  }));

  router.post("/api/care-relationships", asyncHandler(async (req, res) => {
    requireFields(req.body, ["caretakerId", "seniorId"]);
    res.status(201).json(await linkCaretakerToSenior(store, req.body));
  }));

  router.post("/api/medications", asyncHandler(async (req, res) => {
    requireFields(req.body, ["seniorId", "createdBy", "name", "dosage", "times"]);
    res.status(201).json(await createMedication(store, req.body));
  }));

  router.patch("/api/medications/:id", asyncHandler(async (req, res) => {
    res.json(await updateMedication(store, req.params.id, req.body));
  }));

  router.get("/api/seniors/:seniorId/medications", asyncHandler(async (req, res) => {
    res.json(await getMedicationsForSenior(store, req.params.seniorId));
  }));

  router.post("/api/medication-logs", asyncHandler(async (req, res) => {
    requireFields(req.body, ["medicationId", "seniorId", "scheduledFor"]);
    res.status(201).json(await createMedicationLog(store, req.body));
  }));

  router.post("/api/medication-logs/:id/taken", asyncHandler(async (req, res) => {
    res.json(await markMedicationTaken(store, req.params.id, req.body.replyText));
  }));

  router.get("/api/seniors/:seniorId/medication-status/today", asyncHandler(async (req, res) => {
    res.json(await getTodayMedicationStatus(store, req.params.seniorId));
  }));

  router.post("/api/medication-logs/:id/send-reminder", asyncHandler(async (req, res) => {
    res.json(await sendMedicationReminder(store, req.params.id));
  }));

  router.post("/api/medication-logs/:id/escalate", asyncHandler(async (req, res) => {
    res.json(await escalateMissedMedication(store, req.params.id));
  }));

  router.post("/api/calendar-events", asyncHandler(async (req, res) => {
    requireFields(req.body, ["seniorId", "createdBy", "title", "date"]);
    res.status(201).json(await createCalendarEvent(store, req.body));
  }));

  router.get("/api/seniors/:seniorId/calendar-events/upcoming", asyncHandler(async (req, res) => {
    res.json(await getUpcomingCalendarEvents(store, req.params.seniorId));
  }));

  router.post("/api/scam-alerts", asyncHandler(async (req, res) => {
    requireFields(req.body, ["seniorId", "source", "riskLevel", "summary"]);
    res.status(201).json(await createScamAlert(store, req.body));
  }));

  router.get("/api/seniors/:seniorId/scam-alerts", asyncHandler(async (req, res) => {
    res.json(await getScamAlertsForSenior(store, req.params.seniorId));
  }));

  router.get("/api/seniors/:seniorId/agent-logs", asyncHandler(async (req, res) => {
    const logs = (await store.all("agentLogs"))
      .filter((log) => log.seniorId === req.params.seniorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(logs);
  }));

  router.get("/api/seniors/:seniorId/memory/search", asyncHandler(async (req, res) => {
    const query = String(req.query.q ?? "").trim();
    if (!query) {
      res.status(400).json({ error: "q query parameter is required" });
      return;
    }
    const results = await searchSeniorMemory(req.params.seniorId, query);
    res.json({ query, results });
  }));

  router.get("/api/seniors/:seniorId/personal-info", asyncHandler(async (req, res) => {
    res.json({ personalInfo: await getSeniorPersonalInfo(store, req.params.seniorId) });
  }));

  router.put("/api/seniors/:seniorId/personal-info", asyncHandler(async (req, res) => {
    res.json({ personalInfo: await upsertSeniorPersonalInfo(store, req.params.seniorId, req.body) });
  }));

  router.get("/api/agents/seniors/:seniorId/personal-info", asyncHandler(async (req, res) => {
    requireAgentAuth(req);
    res.json({ personalInfo: await getSeniorPersonalInfo(store, req.params.seniorId, { includePassword: true }) });
  }));

  router.post("/api/seniors/:seniorId/hyperspell/connect", asyncHandler(async (req, res) => {
    const provider = normalizeHyperspellProvider(req.body?.provider) ?? "google_mail";
    const fallbackRedirectUrl = new URL("/webhooks/hyperspell/connected", config.hyperspell.publicBaseUrl);
    fallbackRedirectUrl.searchParams.set("seniorId", req.params.seniorId);

    const redirectUrl = req.body?.redirectUrl ?? fallbackRedirectUrl.toString();
    const userToken = await createUserToken(req.params.seniorId);
    const connect = await getConnectUrl(req.params.seniorId, provider, redirectUrl, userToken);
    res.json(connect ?? { url: null, expires_at: null });
  }));

  router.get("/api/seniors/:seniorId/hyperspell/connections", asyncHandler(async (req, res) => {
    await refreshHyperspellConnections(store, req.params.seniorId);
    const connections = (await store.all("hyperspellConnections"))
      .filter((connection) => connection.seniorId === req.params.seniorId);
    res.json(connections);
  }));

  router.post("/api/seniors/:seniorId/hyperspell/sync", asyncHandler(async (req, res) => {
    const calendarEvents = await syncCalendarEvents(store, req.params.seniorId);
    const scamAlerts = await scanEmailsForScams(store, req.params.seniorId);
    res.json({ calendarEvents: calendarEvents.length, scamAlerts: scamAlerts.length });
  }));

  router.post("/api/seniors/:seniorId/hyperspell/email-summary", asyncHandler(async (req, res) => {
    const days = Number(req.body?.days ?? 2);
    const result = await runEmailSummaryAgent(store, req.params.seniorId, {
      days: Number.isFinite(days) ? days : 2
    });
    res.json({
      importantEmails: result.importantEmails,
      importantCount: result.importantEmails.length,
      scamAlerts: result.scamAlerts,
      scamCount: result.scamAlerts.length,
      summary: result.summary,
      connected: result.connected
    });
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

  router.get("/webhooks/hyperspell/connected", asyncHandler(async (req, res) => {
    const seniorId = String(req.query.seniorId ?? "");
    if (seniorId) {
      await refreshHyperspellConnections(store, seniorId);
    }

    res
      .type("html")
      .send(`<!doctype html>
<html>
  <head><title>PawBot connected</title></head>
  <body>
    <p>Google account connected. You can return to PawBot.</p>
    <script>window.close();</script>
  </body>
</html>`);
  }));

  router.post("/webhooks/hyperspell/connected", asyncHandler(async (req, res) => {
    const seniorId = req.body.seniorId ?? req.body.user_id;
    const provider = normalizeHyperspellProvider(req.body.provider ?? req.body.source);
    if (!seniorId || !provider) {
      throw new HttpError(400, "Hyperspell webhook must include user_id/seniorId and source/provider");
    }

    if (req.body.event && req.body.event !== "connection-created") {
      res.json({ ok: true, ignored: req.body.event });
      return;
    }

    const connection = await recordHyperspellConnection(store, { seniorId, provider });
    const synced = await syncProvider(store, seniorId, provider);
    res.json({ connection, synced });
  }));

  router.get("/api/gmail/recent", asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit ?? "5", 10)));
    if (!isComposioConfigured()) {
      res.status(503).json({
        error: "composio_not_configured",
        hint: "Set COMPOSIO_API_KEY in backend/.env and connect Gmail in the Composio dashboard."
      });
      return;
    }
    try {
      const messages = await fetchGmailRecent(limit);
      res.json(messages);
    } catch (err) {
      throw new HttpError(502, err.message);
    }
  }));

  router.get("/api/calendar/upcoming", asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit ?? "5", 10)));
    if (!isComposioConfigured()) {
      res.status(503).json({
        error: "composio_not_configured",
        hint: "Set COMPOSIO_API_KEY in backend/.env and connect Google Calendar in the Composio dashboard."
      });
      return;
    }
    try {
      const events = await fetchCalendarUpcoming(limit);
      res.json(events);
    } catch (err) {
      throw new HttpError(502, err.message);
    }
  }));

  router.get("/api/scam-alerts", (req, res) => {
    res.json({
      alerts: listScamAlerts({ activeOnly: req.query.includeDismissed !== "true" }),
      status: scannerStatus()
    });
  });

  router.post("/api/scam-alerts/:id/dismiss", (req, res) => {
    const ok = dismissScamAlert(req.params.id);
    res.json({ ok });
  });

  router.get("/api/composio/probe/:action", asyncHandler(async (req, res) => {
    if (!isComposioConfigured()) {
      res.status(503).json({ error: "composio_not_configured" });
      return;
    }
    const action = req.params.action;
    const inputBlob = req.query.input ? JSON.parse(req.query.input) : {};
    try {
      const raw = await probeRaw(action, inputBlob);
      res.json({ action, input: inputBlob, raw });
    } catch (err) {
      res.status(502).json({ error: err.message, body: err.body ?? null });
    }
  }));

  router.get("/api/morning-brief", asyncHandler(async (req, res) => {
    const force = req.query.force === "true";
    try {
      const brief = await generateMorningBrief({ force });
      res.json(brief);
    } catch (err) {
      throw new HttpError(502, err.message);
    }
  }));

  router.get("/api/morning-brief/today", (req, res) => {
    const cached = getCachedMorningBrief();
    res.json(cached ?? {
      date: new Date().toISOString().slice(0, 10),
      generatedAt: null,
      brief: null,
      eventsCount: 0,
      emailsCount: 0
    });
  });

  router.get("/api/morning-brief/history", (req, res) => {
    res.json({ briefs: listMorningBriefs() });
  });

  router.post("/api/browser/tasks", (req, res) => {
    const task = (req.body?.task ?? "").toString().trim();
    if (!task) {
      res.status(400).json({ error: "task is required" });
      return;
    }
    const id = enqueueBrowserTask(task);
    res.status(201).json({ id });
  });

  router.get("/api/browser/tasks/next", (req, res) => {
    claimNextBrowserTask(res);
  });

  router.post("/api/browser/tasks/:id/result", (req, res) => {
    recordBrowserResult(req.params.id, req.body?.result ?? "");
    res.json({ ok: true });
  });

  router.get("/api/browser/tasks/:id", (req, res) => {
    res.json(getBrowserResult(req.params.id));
  });

  router.get("/api/browser/tasks/:id/wait", asyncHandler(async (req, res) => {
    const entry = await waitForBrowserResult(req.params.id, 120_000);
    res.json(entry);
  }));

  router.get("/api/credentials/identity", asyncHandler(async (req, res) => {
    const host = req.hostname || "";
    const isLocal = host === "localhost" || host === "127.0.0.1" || host.startsWith("::1") || host === "[::1]";
    if (!isLocal) {
      res.status(403).json({ error: "identity endpoint only available on localhost" });
      return;
    }
    let email = process.env.PAWBOT_USER_EMAIL ?? null;
    let password = process.env.PAWBOT_USER_PASSWORD ?? null;
    let firstName = process.env.PAWBOT_USER_FIRST_NAME ?? null;
    let lastName = process.env.PAWBOT_USER_LAST_NAME ?? null;
    let phone = process.env.PAWBOT_USER_PHONE ?? null;
    const seniorId = process.env.PAWBOT_DEFAULT_SENIOR_ID ?? null;
    if (seniorId) {
      try {
        const info = await getSeniorPersonalInfo(store, seniorId, { includePassword: true });
        email = email ?? info?.email ?? null;
        password = password ?? info?.password ?? null;
        firstName = firstName ?? info?.firstName ?? null;
        lastName = lastName ?? info?.lastName ?? null;
        phone = phone ?? info?.phone ?? null;
      } catch {}
    }
    res.json({ email, password, firstName, lastName, phone, seniorId });
  }));

  router.get("/api/sites/accounts", asyncHandler(async (req, res) => {
    res.json({ accounts: await listSiteAccounts() });
  }));

  router.get("/api/sites/accounts/:domain", asyncHandler(async (req, res) => {
    const account = await getSiteAccount(req.params.domain);
    res.json({ account });
  }));

  router.post("/api/sites/accounts", asyncHandler(async (req, res) => {
    const { domain, email, status, notes } = req.body ?? {};
    if (!domain) {
      res.status(400).json({ error: "domain is required" });
      return;
    }
    const entry = await recordSiteAccount({ domain, email, status, notes });
    res.status(201).json({ account: entry });
  }));

  router.delete("/api/sites/accounts/:domain", asyncHandler(async (req, res) => {
    const ok = await deleteSiteAccount(req.params.domain);
    res.json({ ok });
  }));

  router.get("/api/credentials/xai", (req, res) => {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "credentials endpoint is disabled in production" });
      return;
    }
    const host = req.hostname || "";
    const isLocal = host === "localhost" || host === "127.0.0.1" || host.startsWith("::1") || host === "[::1]";
    if (!isLocal) {
      res.status(403).json({ error: "credentials endpoint only available on localhost" });
      return;
    }
    const key = process.env.XAI_API_KEY ?? null;
    if (!key) {
      res.status(404).json({ error: "XAI_API_KEY not set in backend/.env" });
      return;
    }
    res.json({ key, source: "backend/.env" });
  });

  return router;
}
