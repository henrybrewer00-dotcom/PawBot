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

function msUntilNext9AM() {
  const now = new Date();
  const parts = localParts();
  const todayAt9 = new Date(now);
  todayAt9.setHours(0, 0, 0, 0);
  // Approximate: use local midnight + 9h offset accounting for timezone
  const hourNow = Number(parts.hour);
  const minuteNow = Number(parts.minute);
  const minutesUntil = hourNow < 9
    ? (9 - hourNow) * 60 - minuteNow
    : (24 - hourNow + 9) * 60 - minuteNow;
  return Math.max(60, minutesUntil) * 60 * 1000;
}

async function callCalendarReminders() {
  const response = await fetch(`${baseUrl}/api/agents/calendar-reminders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`[calendar-agent] error ${response.status}: ${body}`);
  } else {
    console.log(`[calendar-agent] ${response.status} ${body}`);
  }
}

if (!baseUrl || !token) {
  throw new Error("PUBLIC_BASE_URL and AGENT_AUTH_TOKEN are required");
}

// Run immediately on startup if it's already past 9 AM today (catches missed first run)
{
  const parts = localParts();
  const hourNow = Number(parts.hour);
  if (hourNow >= 9) {
    console.log("[calendar-agent] past 9 AM on startup — running immediately");
    try {
      await callCalendarReminders();
    } catch (error) {
      console.error("[calendar-agent] startup run failed", error);
    }
  }
}

let lastRunDate = null;

while (true) {
  await sleep(msUntilNext9AM());
  const parts = localParts();
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  if (lastRunDate !== dateKey) {
    try {
      await callCalendarReminders();
      lastRunDate = dateKey;
    } catch (error) {
      console.error("[calendar-agent] reminder run failed", error);
    }
  }
}
