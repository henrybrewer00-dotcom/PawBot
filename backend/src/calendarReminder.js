import { writeAgentLog } from "./agentLog.js";
import { sendText } from "./sendblue.js";
import { toDateKey, toLocalTime } from "./time.js";

function reminderDue(event, senior, now) {
  if (!event.date || event.reminderSentAt) return false;
  const eventDay = toDateKey(new Date(event.date), senior.timezone);
  const today = toDateKey(now, senior.timezone);
  return eventDay === today && (event.reminderTime ?? "09:00") <= toLocalTime(now, senior.timezone);
}

export async function runCalendarReminderAgent(store) {
  const now = new Date();
  const reminders = [];

  for (const senior of (await store.all("users")).filter((user) => user.role === "senior")) {
    const events = (await store.all("calendarEvents"))
      .filter((event) => event.seniorId === senior.id && reminderDue(event, senior, now));

    for (const event of events) {
      const result = await sendText({
        to: senior.phone,
        content: `PawBot reminder: ${event.title} is on your calendar today.`
      });

      const updated = await store.update("calendarEvents", event.id, {
        reminderSentAt: now.toISOString()
      });

      void writeAgentLog(
        store,
        senior.id,
        "calendar_event_reminder_sent",
        { eventId: event.id, title: event.title, date: event.date },
        result
      );
      reminders.push(updated);
    }
  }

  return reminders;
}
