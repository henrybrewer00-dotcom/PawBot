const baseUrl = process.env.PUBLIC_BASE_URL;
const token = process.env.AGENT_AUTH_TOKEN;
const timezone = process.env.AGENT_TIMEZONE ?? "America/Los_Angeles";

function localParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function msUntilNext8PM() {
  const parts = localParts();
  const hourNow = Number(parts.hour);
  const minuteNow = Number(parts.minute);
  const minutesUntil = hourNow < 20
    ? (20 - hourNow) * 60 - minuteNow
    : (24 - hourNow + 20) * 60 - minuteNow;
  return Math.max(60, minutesUntil) * 60 * 1000;
}

async function callDailySummary() {
  const response = await fetch(`${baseUrl}/api/agents/daily-summary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`[daily-summary-agent] error ${response.status}: ${body}`);
  } else {
    console.log(`[daily-summary-agent] ${response.status} ${body}`);
  }
}

if (!baseUrl || !token) {
  throw new Error("PUBLIC_BASE_URL and AGENT_AUTH_TOKEN are required");
}

// Run immediately on startup if it's already past 8 PM today (catches missed first run)
{
  const parts = localParts();
  const hourNow = Number(parts.hour);
  if (hourNow >= 20) {
    console.log("[daily-summary-agent] past 8 PM on startup — running immediately");
    try {
      await callDailySummary();
    } catch (error) {
      console.error("[daily-summary-agent] startup run failed", error);
    }
  }
}

let lastRunDate = null;

while (true) {
  await sleep(msUntilNext8PM());
  const parts = localParts();
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  if (lastRunDate !== dateKey) {
    try {
      await callDailySummary();
      lastRunDate = dateKey;
    } catch (error) {
      console.error("[daily-summary-agent] summary run failed", error);
    }
  }
}
