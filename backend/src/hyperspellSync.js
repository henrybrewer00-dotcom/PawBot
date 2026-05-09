import { createId } from "./id.js";
import { writeAgentLog } from "./agentLog.js";
import { createCalendarEvent, createScamAlert } from "./domain.js";
import { getUserAuthProfile, queryMemory } from "./hyperspell.js";
import { saveFactMemory } from "./nia.js";

const CALENDAR_QUERY = "upcoming events this week birthdays appointments";
const SCAM_QUERY = "suspicious emails verification codes Netflix billing PayPal unusual login";
const SCAM_SIGNALS = [
  "verification code",
  "unusual login",
  "urgent",
  "password",
  "billing",
  "paypal",
  "netflix",
  "gift card",
  "wire transfer",
  "click",
  "suspended",
  "verify"
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
    : document?.date ?? document?.start_time ?? document?.startTime ?? document?.starts_at ?? document?.metadata?.date ?? document?.metadata?.start_time;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

function sourceFromDocument(document) {
  if (typeof document === "string") return "Google Mail";
  return String(document?.from ?? document?.sender ?? document?.source ?? document?.metadata?.from ?? document?.metadata?.sender ?? "Google Mail");
}

function riskLevelFor(text) {
  const normalized = text.toLowerCase();
  const signalCount = SCAM_SIGNALS.filter((signal) => normalized.includes(signal)).length;
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

  const documents = await queryMemory(seniorId, CALENDAR_QUERY, ["google_calendar"]);
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

export async function scanEmailsForScams(store, seniorId) {
  if (!await isConnected(store, seniorId, "google_mail")) return [];

  const documents = await queryMemory(seniorId, SCAM_QUERY, ["gmail"]);
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
  const providers = new Set(
    collectProviderCandidates(profile)
      .map(normalizeHyperspellProvider)
      .filter(Boolean)
  );

  const recorded = [];
  for (const provider of providers) {
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
