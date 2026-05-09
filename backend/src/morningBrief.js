import { fetchGmailRecent, fetchCalendarUpcoming, isComposioConfigured } from "./composio.js";
import { grokChat } from "./grok.js";

const briefHistory = [];
const MAX_HISTORY = 14;
let cachedBrief = null;

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function localDateString(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function formatEventLine(event) {
  const title = event.title || "(no title)";
  const start = event.start;
  let when = "Time unknown";
  if (start) {
    const d = new Date(start);
    if (!Number.isNaN(d.getTime())) {
      const sameDay = d.toDateString() === new Date().toDateString();
      when = sameDay
        ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
    }
  }
  const where = event.location ? ` at ${event.location}` : "";
  return `- ${title} (${when})${where}`;
}

function formatEmailLine(email) {
  const from = email.from || "Unknown";
  const subject = email.subject || "(no subject)";
  const snippet = (email.snippet || "").trim().slice(0, 140);
  return `- ${from}: ${subject}${snippet ? ` — ${snippet}` : ""}`;
}

export async function generateMorningBrief({ force = false } = {}) {
  if (!isComposioConfigured()) {
    throw new Error("Composio is not configured. Set COMPOSIO_API_KEY in backend/.env to generate a morning brief.");
  }
  if (!process.env.XAI_API_KEY) {
    throw new Error("XAI_API_KEY not set — Pawbot needs Grok to write the brief.");
  }

  const dateKey = todayKey();
  if (!force && cachedBrief?.date === dateKey) {
    return cachedBrief;
  }

  const [events, emails] = await Promise.all([
    fetchCalendarUpcoming(10).catch(() => []),
    fetchGmailRecent(8).catch(() => [])
  ]);

  const now = new Date();
  const isToday = (raw) => {
    if (!raw) return false;
    const d = new Date(raw);
    return d.toDateString() === now.toDateString();
  };
  const todaysEvents = events.filter((e) => isToday(e.start));
  const upcomingEvents = events.filter((e) => !isToday(e.start)).slice(0, 3);

  const eventsBlock = todaysEvents.length
    ? todaysEvents.map(formatEventLine).join("\n")
    : "(nothing scheduled today)";
  const upcomingBlock = upcomingEvents.length
    ? upcomingEvents.map(formatEventLine).join("\n")
    : "(no notable upcoming events)";
  const emailsBlock = emails.length
    ? emails.map(formatEmailLine).join("\n")
    : "(no recent emails)";

  const userPrompt = [
    `It is the morning of ${localDateString(now)}.`,
    "Write a warm, calm morning brief for an older adult, in 4-6 short sentences. Use plain language. No jargon. No emoji unless one fits naturally.",
    "Structure:",
    "1) Friendly good-morning greeting that mentions the day.",
    "2) What's on their calendar today (or that they have a free day).",
    "3) The most important upcoming events in the next few days, if any.",
    "4) Notable emails from the last day, only if any look important — gently flag anything that could be a scam or urgent without alarm.",
    "5) End with one kind question or suggestion (e.g., a glass of water, a short walk, a favorite show).",
    "",
    "Today's calendar:",
    eventsBlock,
    "",
    "Upcoming days:",
    upcomingBlock,
    "",
    "Recent emails:",
    emailsBlock
  ].join("\n");

  const text = await grokChat(
    [
      { role: "system", content: "You are Pawbot, a kind morning briefer for older adults. Keep it short, warm, and plain." },
      { role: "user", content: userPrompt }
    ],
    { temperature: 0.6, maxTokens: 380 }
  );

  cachedBrief = {
    date: dateKey,
    generatedAt: now.toISOString(),
    brief: text.trim(),
    eventsCount: todaysEvents.length,
    emailsCount: emails.length
  };
  briefHistory.push(cachedBrief);
  if (briefHistory.length > MAX_HISTORY) briefHistory.shift();
  return cachedBrief;
}

export function getCachedMorningBrief() {
  return cachedBrief;
}

export function listMorningBriefs() {
  return briefHistory.slice().sort((a, b) => b.date.localeCompare(a.date));
}

let scheduled = false;
export function scheduleMorningBrief() {
  if (scheduled) return;
  scheduled = true;
  const tick = async () => {
    const now = new Date();
    if (now.getHours() === 7 && now.getMinutes() < 5) {
      try {
        await generateMorningBrief({ force: true });
        console.log("[morningBrief] generated for", todayKey(now));
      } catch (err) {
        console.error("[morningBrief] generation failed:", err.message);
      }
    }
  };
  setInterval(tick, 5 * 60 * 1000);
}
