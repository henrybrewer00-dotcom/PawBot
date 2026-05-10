const COMPOSIO_BASE = process.env.COMPOSIO_BASE_URL ?? "https://backend.composio.dev/api/v3";
const US_HOLIDAY_CALENDAR_ID = "en.usa#holiday@group.v.calendar.google.com";

export function isComposioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

export async function composioExecute(actionName, input = {}, opts = {}) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    const err = new Error("COMPOSIO_API_KEY not set");
    err.code = "composio_not_configured";
    throw err;
  }
  const body = { arguments: input };
  const explicitConn = opts.connectedAccountId ?? process.env.COMPOSIO_CONNECTED_ACCOUNT_ID;
  if (explicitConn) body.connected_account_id = explicitConn;
  const userId = opts.userId ?? process.env.COMPOSIO_USER_ID ?? process.env.COMPOSIO_ENTITY_ID ?? "default";
  if (userId) body.user_id = userId;

  const base = COMPOSIO_BASE.replace(/\/+$/, "");
  const res = await fetch(`${base}/tools/execute/${encodeURIComponent(actionName)}`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Composio ${actionName} failed: HTTP ${res.status} ${text.slice(0, 280)}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

function findArray(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return null;
  if (Array.isArray(obj)) return obj;
  for (const k of keys) {
    if (Array.isArray(obj[k])) return obj[k];
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = findArray(v, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function pickField(obj, candidates) {
  for (const path of candidates) {
    const parts = path.split(".");
    let cur = obj;
    let ok = true;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) cur = cur[p];
      else { ok = false; break; }
    }
    if (ok && cur != null && cur !== "") return cur;
  }
  return null;
}

function pickHeader(message, name) {
  const headers = message.payload?.headers ?? message.headers ?? [];
  if (!Array.isArray(headers)) return null;
  const lower = name.toLowerCase();
  const hit = headers.find((h) => (h?.name ?? h?.Name ?? "").toLowerCase() === lower);
  return hit?.value ?? hit?.Value ?? null;
}

function asString(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => asString(v, "")).filter(Boolean).join(", ");
  if (typeof value === "object") {
    if (typeof value.email === "string" && typeof value.name === "string") return `${value.name} <${value.email}>`;
    try { return JSON.stringify(value).slice(0, 240); } catch { return fallback; }
  }
  return fallback;
}

function asNullableString(value) {
  if (value == null) return null;
  return asString(value, "") || null;
}

function upcomingTimeMin() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function fetchGmailRecent(limit = 5) {
  const result = await composioExecute("GMAIL_FETCH_EMAILS", {
    max_results: limit,
    query: "in:inbox",
    verbose: true
  });
  const list = findArray(result, ["messages", "emails", "results", "items"]) ?? [];
  const mapped = list.map((m) => ({
    id: asString(pickField(m, ["id", "messageId", "message_id", "thread_id", "threadId"]), ""),
    from: asString(pickField(m, ["from", "sender", "fromEmail", "from_email"]) ?? pickHeader(m, "From"), "Unknown"),
    subject: asString(pickField(m, ["subject", "Subject", "title"]) ?? pickHeader(m, "Subject"), "(no subject)"),
    snippet: asString(pickField(m, ["snippet", "preview", "messageText", "message_text", "body.text", "bodyText", "body"]), ""),
    date: asNullableString(pickField(m, ["date", "receivedAt", "messageTimestamp", "internalDate", "timestamp"]) ?? pickHeader(m, "Date"))
  })).filter((m) => m.id || m.subject !== "(no subject)");
  return mapped;
}

function mapCalendarEvent(e, source = "google_calendar") {
  const title = asString(pickField(e, ["summary", "title", "eventName", "event_name"]), "(no title)");
  return {
    id: asString(pickField(e, ["id", "eventId", "event_id"]), ""),
    title,
    start: asNullableString(pickField(e, ["start.dateTime", "start.date", "startTime", "start_time", "start"])),
    end: asNullableString(pickField(e, ["end.dateTime", "end.date", "endTime", "end_time", "end"])),
    location: asNullableString(pickField(e, ["location", "venue"])),
    description: asNullableString(pickField(e, ["description", "notes"])),
    source,
    eventType: source === "google_holiday" ? "holiday" : "calendar",
    isHoliday: source === "google_holiday"
  };
}

async function fetchCalendarEventsFrom(calendarId, limit, source) {
  const result = await composioExecute("GOOGLECALENDAR_FIND_EVENT", {
    calendar_id: calendarId,
    max_results: limit,
    single_events: true,
    order_by: "startTime",
    timeMin: upcomingTimeMin()
  });
  const list = findArray(result, ["items", "events", "results", "eventList", "event_data"]) ?? [];
  return list.map((e) => mapCalendarEvent(e, source)).filter((e) => e.id || e.title !== "(no title)");
}

function eventTime(event) {
  const raw = event.start ?? event.end;
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function dedupeCalendarEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.source}:${event.id || event.title}:${event.start || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchCalendarUpcoming(limit = 5) {
  const perCalendarLimit = Math.max(limit, 10);
  const [primary, holidays] = await Promise.all([
    fetchCalendarEventsFrom("primary", perCalendarLimit, "google_calendar").catch(() => []),
    fetchCalendarEventsFrom(US_HOLIDAY_CALENDAR_ID, perCalendarLimit, "google_holiday").catch(() => [])
  ]);

  return dedupeCalendarEvents([...primary, ...holidays])
    .sort((a, b) => eventTime(a) - eventTime(b))
    .slice(0, limit);
}

export async function probeRaw(action, input) {
  return composioExecute(action, input);
}
