const COMPOSIO_BASE = process.env.COMPOSIO_BASE_URL ?? "https://backend.composio.dev/api/v3";

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
  const body = { input };
  const explicitConn = opts.connectedAccountId ?? process.env.COMPOSIO_CONNECTED_ACCOUNT_ID;
  if (explicitConn) body.connectedAccountId = explicitConn;
  const explicitEntity = opts.entityId ?? process.env.COMPOSIO_ENTITY_ID ?? "default";
  if (explicitEntity) body.entityId = explicitEntity;

  const res = await fetch(`${COMPOSIO_BASE}/actions/${actionName}/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

export async function fetchGmailRecent(limit = 5) {
  const result = await composioExecute("GMAIL_FETCH_EMAILS", {
    max_results: limit,
    query: "in:inbox",
    verbose: true
  });
  const list = findArray(result, ["messages", "emails", "results", "items"]) ?? [];
  const mapped = list.map((m) => ({
    id: pickField(m, ["id", "messageId", "message_id", "thread_id", "threadId"]) ?? "",
    from: pickField(m, ["from", "sender", "fromEmail", "from_email"]) ?? pickHeader(m, "From") ?? "Unknown",
    subject: pickField(m, ["subject", "Subject", "title"]) ?? pickHeader(m, "Subject") ?? "(no subject)",
    snippet: pickField(m, ["snippet", "preview", "messageText", "message_text", "body.text", "bodyText", "body"]) ?? "",
    date: pickField(m, ["date", "receivedAt", "messageTimestamp", "internalDate", "timestamp"]) ?? pickHeader(m, "Date") ?? null
  })).filter((m) => m.id || m.subject !== "(no subject)");
  return mapped;
}

export async function fetchCalendarUpcoming(limit = 5) {
  const result = await composioExecute("GOOGLECALENDAR_FIND_EVENT", {
    calendar_id: "primary",
    max_results: limit,
    single_events: true,
    order_by: "startTime",
    timeMin: new Date().toISOString()
  });
  const list = findArray(result, ["items", "events", "results", "eventList"]) ?? [];
  return list.map((e) => ({
    id: pickField(e, ["id", "eventId", "event_id"]) ?? "",
    title: pickField(e, ["summary", "title", "eventName", "event_name"]) ?? "(no title)",
    start: pickField(e, ["start.dateTime", "start.date", "startTime", "start_time", "start"]) ?? null,
    end: pickField(e, ["end.dateTime", "end.date", "endTime", "end_time", "end"]) ?? null,
    location: pickField(e, ["location", "venue"]) ?? null,
    description: pickField(e, ["description", "notes"]) ?? null
  })).filter((e) => e.id || e.title !== "(no title)");
}

export async function probeRaw(action, input) {
  return composioExecute(action, input);
}
