import { writeAgentLog } from "./agentLog.js";
import { sendText } from "./sendblue.js";
import { toDateKey } from "./time.js";

function todayItems(items, dateField, timezone) {
  const today = toDateKey(new Date(), timezone);
  return items.filter((item) => {
    const raw = item[dateField];
    return raw && toDateKey(new Date(raw), timezone) === today;
  });
}

async function caretakersForSenior(store, seniorId) {
  const relationships = (await store.all("careRelationships")).filter((r) => r.seniorId === seniorId);
  return (await Promise.all(
    relationships.map((r) => store.find("users", (user) => user.id === r.caretakerId))
  )).filter(Boolean);
}

function buildSummary(senior, counts) {
  return [
    `PawBot daily summary for ${senior.name}:`,
    `${counts.taken} medication(s) confirmed taken.`,
    `${counts.missed} medication reminder(s) still unconfirmed.`,
    `${counts.escalated} medication escalation(s).`,
    `${counts.scamAlerts} scam alert(s) logged.`,
    `${counts.calendarReminders} calendar reminder(s) sent.`
  ].join(" ");
}

export async function runDailySummaryAgent(store) {
  const summaries = [];

  for (const senior of (await store.all("users")).filter((user) => user.role === "senior")) {
    const medicationLogs = todayItems(
      (await store.all("medicationLogs")).filter((log) => log.seniorId === senior.id),
      "scheduledFor",
      senior.timezone
    );
    const scamAlerts = todayItems(
      (await store.all("scamAlerts")).filter((alert) => alert.seniorId === senior.id),
      "createdAt",
      senior.timezone
    );
    const calendarReminders = todayItems(
      (await store.all("agentLogs")).filter((log) => log.seniorId === senior.id && log.agentAction === "calendar_event_reminder_sent"),
      "createdAt",
      senior.timezone
    );

    const counts = {
      taken: medicationLogs.filter((log) => log.status === "taken").length,
      missed: medicationLogs.filter((log) => ["pending", "sent"].includes(log.status)).length,
      escalated: medicationLogs.filter((log) => log.status === "escalated").length,
      scamAlerts: scamAlerts.length,
      calendarReminders: calendarReminders.length
    };
    const summary = buildSummary(senior, counts);
    const caretakers = await caretakersForSenior(store, senior.id);
    const results = [];

    for (const caretaker of caretakers) {
      results.push(await sendText({
        to: caretaker.phone,
        content: summary
      }));
    }

    void writeAgentLog(
      store,
      senior.id,
      "daily_summary_sent",
      { caretakerCount: caretakers.length },
      { ...counts, results }
    );
    summaries.push({ seniorId: senior.id, summariesSent: caretakers.length, counts });
  }

  return summaries;
}
