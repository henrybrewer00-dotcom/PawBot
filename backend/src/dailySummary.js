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

function caretakersForSenior(store, seniorId) {
  return store
    .all("careRelationships")
    .filter((relationship) => relationship.seniorId === seniorId)
    .map((relationship) => store.find("users", (user) => user.id === relationship.caretakerId))
    .filter(Boolean);
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

  for (const senior of store.all("users").filter((user) => user.role === "senior")) {
    const medicationLogs = todayItems(
      store.all("medicationLogs").filter((log) => log.seniorId === senior.id),
      "scheduledFor",
      senior.timezone
    );
    const scamAlerts = todayItems(
      store.all("scamAlerts").filter((alert) => alert.seniorId === senior.id),
      "createdAt",
      senior.timezone
    );
    const calendarReminders = todayItems(
      store.all("agentLogs").filter((log) => log.seniorId === senior.id && log.agentAction === "calendar_event_reminder_sent"),
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
    const caretakers = caretakersForSenior(store, senior.id);
    const results = [];

    for (const caretaker of caretakers) {
      results.push(await sendText({
        to: caretaker.phone,
        content: summary
      }));
    }

    writeAgentLog(
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
