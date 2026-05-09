import { createId } from "./id.js";
import { writeAgentLog } from "./agentLog.js";
import { createCalendarEvent, createScamAlert } from "./domain.js";
import { queryMemory } from "./hyperspell.js";
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

function isConnected(store, seniorId, provider) {
  return store.all("hyperspellConnections").some((connection) => (
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

function hasCalendarDuplicate(store, seniorId, title, date) {
  return store.all("calendarEvents").some((event) => (
    event.seniorId === seniorId && event.title === title && event.date === date
  ));
}

function hasScamDuplicateToday(store, seniorId, summary) {
  const today = todayKey();
  return store.all("scamAlerts").some((alert) => (
    alert.seniorId === seniorId &&
    alert.summary === summary &&
    String(alert.createdAt ?? "").startsWith(today)
  ));
}

export async function syncCalendarEvents(store, seniorId) {
  if (!isConnected(store, seniorId, "google_calendar")) return [];

  const documents = await queryMemory(seniorId, CALENDAR_QUERY, ["google_calendar"]);
  const created = [];

  for (const document of documents) {
    const title = titleFromDocument(document, "Google Calendar event");
    const date = dateFromDocument(document);
    if (!title || !date || hasCalendarDuplicate(store, seniorId, title, date)) continue;

    const event = createCalendarEvent(store, {
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

  writeAgentLog(store, seniorId, "hyperspell_calendar_sync", { query: CALENDAR_QUERY }, { created: created.length });
  return created;
}

export async function scanEmailsForScams(store, seniorId) {
  if (!isConnected(store, seniorId, "google_mail")) return [];

  const documents = await queryMemory(seniorId, SCAM_QUERY, ["google_mail"]);
  const created = [];

  for (const document of documents) {
    const text = textFromDocument(document);
    if (!text) continue;

    const summary = text.slice(0, 500);
    if (hasScamDuplicateToday(store, seniorId, summary)) continue;

    const alert = createScamAlert(store, {
      seniorId,
      source: sourceFromDocument(document),
      riskLevel: riskLevelFor(text),
      summary,
      actionTaken: "logged_from_hyperspell",
      caretakerNotified: false
    });
    created.push(alert);
  }

  writeAgentLog(store, seniorId, "hyperspell_mail_scam_scan", { query: SCAM_QUERY }, { created: created.length });
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

export function recordHyperspellConnection(store, { seniorId, provider }) {
  const existing = store.find("hyperspellConnections", (connection) => (
    connection.seniorId === seniorId && connection.provider === provider
  ));
  if (existing) return existing;

  return store.insert("hyperspellConnections", {
    id: createId("hspell"),
    seniorId,
    provider,
    connectedAt: new Date().toISOString()
  });
}

export async function runHyperspellSyncTick(store) {
  const seniors = store.all("users").filter((user) => user.role === "senior");
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
