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

export async function fetchGmailRecent(limit = 5) {
  const result = await composioExecute("GMAIL_FETCH_EMAILS", {
    max_results: limit,
    query: "in:inbox",
    verbose: true
  });
  const data = result.data ?? result.response_data ?? result;
  const list = data.messages ?? data.results ?? data.emails ?? [];
  return list.map((m) => ({
    id: m.id ?? m.messageId ?? m.thread_id ?? "",
    from: m.from ?? m.sender ?? m.payload?.headers?.find?.((h) => h.name === "From")?.value ?? "Unknown",
    subject: m.subject ?? m.payload?.headers?.find?.((h) => h.name === "Subject")?.value ?? "(no subject)",
    snippet: m.snippet ?? m.preview ?? m.body?.text ?? "",
    date: m.date ?? m.receivedAt ?? m.payload?.headers?.find?.((h) => h.name === "Date")?.value ?? null
  })).filter((m) => m.id);
}

export async function fetchCalendarUpcoming(limit = 5) {
  const result = await composioExecute("GOOGLECALENDAR_FIND_EVENT", {
    calendar_id: "primary",
    max_results: limit,
    single_events: true,
    order_by: "startTime",
    timeMin: new Date().toISOString()
  });
  const data = result.data ?? result.response_data ?? result;
  const list = data.items ?? data.events ?? [];
  return list.map((e) => ({
    id: e.id ?? "",
    title: e.summary ?? e.title ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    location: e.location ?? null,
    description: e.description ?? null
  })).filter((e) => e.id);
}
