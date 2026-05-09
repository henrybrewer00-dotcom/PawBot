import { createId } from "./id.js";
import { writeAgentLog } from "./agentLog.js";
import { createCalendarEvent, createScamAlert } from "./domain.js";
import { getUserAuthProfile, queryMemory } from "./hyperspell.js";
import { saveFactMemory } from "./nia.js";
import { grokChat } from "./grok.js";

const CALENDAR_QUERY = "upcoming events this week birthdays appointments";
const SCAM_QUERY = "suspicious emails verification codes Netflix billing PayPal unusual login";
const IMPORTANT_EMAIL_QUERY = "emails from the past couple days notices appointments bills letters landlord property lease tenant delivery account renewal service official family caregivers medical banking";
const SCAM_SIGNALS = [
  "verification code",
  "unusual login",
  "password",
  "paypal",
  "netflix",
  "gift card",
  "wire transfer",
  "suspended",
  "verify your account",
  "click here to confirm",
  "limited time offer",
  "you have won"
];
const IMPORTANT_SIGNALS = [
  "appointment",
  "bill",
  "invoice",
  "payment",
  "doctor",
  "medical",
  "pharmacy",
  "family",
  "caregiver",
  "security",
  "bank",
  "insurance",
  "deadline",
  "confirm",
  "schedule",
  "notice",
  "entry",
  "landlord",
  "property",
  "lease",
  "tenant",
  "rent",
  "renewal",
  "account",
  "subscription",
  "delivery",
  "package",
  "order",
  "letter",
  "official",
  "reminder",
  "due",
  "expire",
  "action required"
];

const PROVIDER_ALIASES = new Map([
  ["google_calendar", "google_calendar"],
  ["calendar", "google_calendar"],
  ["gcal", "google_calendar"],
  ["gmail", "google_mail"],
  ["google_mail", "google_mail"],
  ["google_gmail", "google_mail"],
  ["mail", "google_mail"]
]);

export function normalizeHyperspellProvider(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const key = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (PROVIDER_ALIASES.has(key)) return PROVIDER_ALIASES.get(key);
  if (key.includes("gmail") || (key.includes("google") && key.includes("mail"))) return "google_mail";
  if (key.includes("calendar")) return "google_calendar";
  return null;
}

async function isConnected(store, seniorId, provider) {
  return (await store.all("hyperspellConnections")).some((connection) => (
    connection.seniorId === seniorId && connection.provider === provider
  ));
}

function textFromDocument(document) {
  if (typeof document === "string") return document;
  return [
    document?.title,
    document?.summary,
    document?.content,
    document?.text,
    document?.snippet,
    document?.description,
    document?.metadata?.summary,
    document?.metadata?.description
  ].filter(Boolean).join("\n");
}

function titleFromDocument(document, fallback) {
  if (typeof document === "string") return fallback;
  return String(document?.title ?? document?.name ?? document?.metadata?.title ?? fallback).trim();
}

function dateFromDocument(document) {
  const raw = typeof document === "string"
    ? null
    : document?.start_at ?? document?.date ?? document?.start_time ?? document?.startTime ?? document?.starts_at ?? document?.metadata?.date ?? document?.metadata?.start_time;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

function sourceFromDocument(document) {
  if (typeof document === "string") return "Google Mail";
  return String(document?.from ?? document?.sender ?? document?.source ?? document?.metadata?.from ?? document?.metadata?.sender ?? "Google Mail");
}

function emailSubjectFromDocument(document, fallback = "Email") {
  if (typeof document === "string") return fallback;
  return String(document?.subject ?? document?.title ?? document?.name ?? document?.metadata?.subject ?? document?.metadata?.title ?? fallback).trim();
}

function emailDateFromDocument(document) {
  if (typeof document === "string") return null;
  const raw = document?.date ??
    document?.received_at ??
    document?.receivedAt ??
    document?.created_at ??
    document?.createdAt ??
    document?.metadata?.date ??
    document?.metadata?.received_at ??
    document?.metadata?.receivedAt;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

function signalMatches(text, signals) {
  const normalized = text.toLowerCase();
  return signals.filter((signal) => normalized.includes(signal));
}

function riskLevelFor(text) {
  const signalCount = signalMatches(text, SCAM_SIGNALS).length;
  return signalCount >= 2 ? "high" : "medium";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function hasCalendarDuplicate(store, seniorId, title, date) {
  return (await store.all("calendarEvents")).some((event) => (
    event.seniorId === seniorId && event.title === title && event.date === date
  ));
}

async function hasScamDuplicateToday(store, seniorId, summary) {
  const today = todayKey();
  return (await store.all("scamAlerts")).some((alert) => (
    alert.seniorId === seniorId &&
    alert.summary === summary &&
    String(alert.createdAt ?? "").startsWith(today)
  ));
}

export async function syncCalendarEvents(store, seniorId) {
  if (!await isConnected(store, seniorId, "google_calendar")) return [];

  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const documents = await queryMemory(
    seniorId,
    CALENDAR_QUERY,
    ["google_calendar"],
    { effort: "high", options: { after: now.toISOString(), before: twoWeeksOut.toISOString(), max_results: 20 } }
  );
  const created = [];

  for (const document of documents) {
    const title = titleFromDocument(document, "Google Calendar event");
    const date = dateFromDocument(document);
    if (!title || !date || await hasCalendarDuplicate(store, seniorId, title, date)) continue;

    const event = await createCalendarEvent(store, {
      seniorId,
      createdBy: "hyperspell",
      title,
      eventType: "hyperspell_google_calendar",
      date,
      recurrence: null,
      reminderTime: "09:00"
    });
    created.push(event);
    await saveFactMemory(seniorId, "upcoming-event", {
      title: event.title,
      date: event.date,
      source: "google_calendar",
      eventId: event.id
    });
  }

  void writeAgentLog(store, seniorId, "hyperspell_calendar_sync", { query: CALENDAR_QUERY }, { created: created.length });
  return created;
}

const GMAIL_LIVE_OPTS = { effort: "high", options: { google_mail: { label_ids: ["INBOX"] }, max_results: 20 } };

export async function scanEmailsForScams(store, seniorId) {
  if (!await isConnected(store, seniorId, "google_mail")) return [];

  const documents = await queryMemory(seniorId, SCAM_QUERY, ["google_mail"], GMAIL_LIVE_OPTS);
  const created = [];

  for (const document of documents) {
    const text = textFromDocument(document);
    if (!text) continue;

    const summary = text.slice(0, 500);
    if (await hasScamDuplicateToday(store, seniorId, summary)) continue;

    const alert = await createScamAlert(store, {
      seniorId,
      source: sourceFromDocument(document),
      riskLevel: riskLevelFor(text),
      summary,
      actionTaken: "logged_from_hyperspell",
      caretakerNotified: false
    });
    created.push(alert);
  }

  void writeAgentLog(store, seniorId, "hyperspell_mail_scam_scan", { query: SCAM_QUERY }, { created: created.length });
  return created;
}

export async function runEmailSummaryAgent(store, seniorId, { days = 2 } = {}) {
  if (!await isConnected(store, seniorId, "google_mail")) {
    return {
      connected: false,
      importantEmails: [],
      scamAlerts: [],
      summary: "Gmail is not connected for this senior."
    };
  }

  const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const query = `${IMPORTANT_EMAIL_QUERY} last ${days} days`;
  const documents = await queryMemory(seniorId, query, ["google_mail"], {
    effort: "high",
    options: { after, google_mail: { label_ids: ["INBOX"] }, max_results: 20 }
  });
  const importantEmails = [];
  const scamAlerts = [];

  for (const document of documents.slice(0, 20)) {
    const text = textFromDocument(document);
    if (!text) continue;

    const scamSignals = signalMatches(text, SCAM_SIGNALS);
    const importantSignals = signalMatches(text, IMPORTANT_SIGNALS);
    const subject = emailSubjectFromDocument(document);
    const sender = sourceFromDocument(document);
    const receivedAt = emailDateFromDocument(document);
    const summary = text.replace(/\s+/g, " ").trim().slice(0, 300);

    if (scamSignals.length > 0) {
      if (!await hasScamDuplicateToday(store, seniorId, summary)) {
        scamAlerts.push(await createScamAlert(store, {
          seniorId,
          source: sender,
          riskLevel: riskLevelFor(text),
          summary: `${subject}: ${summary}`,
          actionTaken: "marked_as_scam_from_email_summary",
          caretakerNotified: false
        }));
      }
      continue;
    }

    if (importantSignals.length > 0 || importantEmails.length < 15) {
      importantEmails.push({
        subject,
        sender,
        receivedAt,
        whyImportant: importantSignals.slice(0, 4),
        summary
      });
    }
  }

  let summary;
  if (importantEmails.length) {
    const emailList = importantEmails
      .map((e, i) => `${i + 1}. Subject: "${e.subject}" | From: ${e.sender} | Snippet: ${e.summary}`)
      .join("\n");
    try {
      summary = await grokChat([
        {
          role: "system",
          content: "You are a concise email assistant helping an elderly person's caretaker. Summarize the following emails in 2-4 plain sentences. Highlight anything time-sensitive or that requires action. Be warm, clear, and brief — no bullet points, no headers."
        },
        {
          role: "user",
          content: `Here are ${importantEmails.length} important email(s) from the last ${days} day(s):\n\n${emailList}`
        }
      ]);
    } catch {
      summary = importantEmails.map((e, i) => `${i + 1}. ${e.subject} from ${e.sender}: ${e.summary}`).join("\n");
    }
  } else {
    summary = `No important non-scam emails found in the last ${days} days.`;
  }

  await writeAgentLog(
    store,
    seniorId,
    "gmail_email_summary",
    { query, days },
    {
      importantCount: importantEmails.length,
      scamCount: scamAlerts.length,
      importantEmails,
      scamAlertIds: scamAlerts.map((alert) => alert.id),
      summary
    }
  );

  await saveFactMemory(seniorId, "gmail-email-summary", {
    days,
    importantCount: importantEmails.length,
    scamCount: scamAlerts.length,
    summary
  });

  return {
    connected: true,
    importantEmails,
    scamAlerts,
    summary
  };
}

export async function syncProvider(store, seniorId, provider) {
  if (provider === "google_calendar") {
    const calendarEvents = await syncCalendarEvents(store, seniorId);
    return { calendarEvents: calendarEvents.length, scamAlerts: 0 };
  }
  if (provider === "google_mail") {
    const scamAlerts = await scanEmailsForScams(store, seniorId);
    return { calendarEvents: 0, scamAlerts: scamAlerts.length };
  }
  return { calendarEvents: 0, scamAlerts: 0 };
}

export async function recordHyperspellConnection(store, { seniorId, provider }) {
  const normalizedProvider = normalizeHyperspellProvider(provider);
  if (!seniorId || !normalizedProvider) return null;

  const existing = await store.find("hyperspellConnections", (connection) => (
    connection.seniorId === seniorId && connection.provider === normalizedProvider
  ));
  if (existing) return existing;

  return store.insert("hyperspellConnections", {
    id: createId("hspell"),
    seniorId,
    provider: normalizedProvider,
    connectedAt: new Date().toISOString()
  });
}

function collectProviderCandidates(value, candidates = []) {
  if (!value) return candidates;

  if (typeof value === "string") {
    candidates.push(value);
    return candidates;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectProviderCandidates(item, candidates);
    return candidates;
  }

  if (typeof value !== "object") return candidates;

  const directKeys = ["source", "provider", "name", "slug", "type"];
  for (const key of directKeys) {
    if (typeof value[key] === "string") candidates.push(value[key]);
  }

  const collectionKeys = [
    "connections",
    "connected_sources",
    "connectedSources",
    "providers",
    "sources",
    "integrations",
    "installed_integrations",
    "installedIntegrations",
    "connected_integrations",
    "connectedIntegrations"
  ];
  for (const key of collectionKeys) {
    collectProviderCandidates(value[key], candidates);
  }

  return candidates;
}

export async function refreshHyperspellConnections(store, seniorId) {
  const profile = await getUserAuthProfile(seniorId);

  // Use installed_integrations as the authoritative list
  const installedRaw = profile?.installed_integrations ?? collectProviderCandidates(profile);
  const liveProviders = new Set(
    installedRaw.map(normalizeHyperspellProvider).filter(Boolean)
  );

  // Remove any local connections that Hyperspell no longer reports
  const existing = (await store.all("hyperspellConnections"))
    .filter((c) => c.seniorId === seniorId);
  for (const conn of existing) {
    if (!liveProviders.has(normalizeHyperspellProvider(conn.provider))) {
      await store.delete("hyperspellConnections", conn.id);
    }
  }

  // Add any newly connected providers
  const recorded = [];
  for (const provider of liveProviders) {
    recorded.push(await recordHyperspellConnection(store, { seniorId, provider }));
  }

  return recorded.filter(Boolean);
}

export async function runHyperspellSyncTick(store) {
  const seniors = (await store.all("users")).filter((user) => user.role === "senior");
  const results = [];

  for (const senior of seniors) {
    const calendarEvents = await syncCalendarEvents(store, senior.id);
    const scamAlerts = await scanEmailsForScams(store, senior.id);
    if (calendarEvents.length > 0 || scamAlerts.length > 0) {
      results.push({
        seniorId: senior.id,
        calendarEvents: calendarEvents.length,
        scamAlerts: scamAlerts.length
      });
    }
  }

  return results;
}
