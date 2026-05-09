import { createId } from "./id.js";
import { HttpError } from "./http.js";
import { writeAgentLog } from "./agentLog.js";
import { sendText } from "./sendblue.js";
import { config } from "./config.js";
import { normalizeEmail, normalizeLookupIdentifier, normalizePhone } from "./identity.js";
import { saveEpisodicMemory, saveFactMemory, searchSeniorMemory } from "./nia.js";
import { minutesBetween, scheduledIsoForLocalTime, toDateKey, toLocalTime } from "./time.js";

const TAKEN_REPLIES = new Set(["YES", "Y", "DONE", "TAKEN", "TOOK IT", "TAKE"]);

export async function createUser(store, { name, phone, email, role, timezone = "America/Los_Angeles", authUserId = null }) {
  if (!["senior", "caretaker"].includes(role)) {
    throw new HttpError(400, "role must be senior or caretaker");
  }

  return store.insert("users", {
    id: createId("user"),
    authUserId,
    name,
    phone,
    email,
    role,
    timezone,
    createdAt: new Date().toISOString()
  });
}

export async function getAccountProfile(store, authUser) {
  const account = await store.find("users", (user) => user.authUserId === authUser.id);
  if (!account) return null;

  if (account.role === "senior") {
    return {
      account,
      seniorId: account.id,
      seniors: [account]
    };
  }

  const relationships = (await store.all("careRelationships"))
    .filter((relationship) => relationship.caretakerId === account.id);
  const seniors = (await Promise.all(
    relationships.map((relationship) => store.find("users", (user) => user.id === relationship.seniorId))
  )).filter(Boolean);

  return {
    account,
    seniorId: seniors[0]?.id ?? null,
    seniors
  };
}

export async function upsertAccountProfile(store, authUser, body) {
  const role = body.role;
  if (!["senior", "caretaker"].includes(role)) {
    throw new HttpError(400, "role must be senior or caretaker");
  }

  const email = authUser.email ?? body.email;
  if (!email) throw new HttpError(400, "Authenticated user is missing an email address");

  // Primary lookup: auth user already linked to a profile
  let existing = await store.find("users", (user) => user.authUserId === authUser.id);

  // Fallback: caretaker pre-created a profile for this email (authUserId is null)
  // Link the auth account to that existing profile instead of creating a duplicate
  if (!existing) {
    const preCreated = await store.find(
      "users",
      (user) => user.email === email && user.authUserId === null
    );
    if (preCreated) {
      existing = await store.update("users", preCreated.id, { authUserId: authUser.id });
    }
  }

  if (existing) {
    const updated = await store.update("users", existing.id, {
      name: body.name ?? existing.name,
      phone: body.phone ?? existing.phone,
      timezone: body.timezone ?? existing.timezone
    });
    return getAccountProfile(store, { ...authUser, id: updated.authUserId });
  }

  await createUser(store, {
    authUserId: authUser.id,
    name: body.name,
    phone: body.phone,
    email,
    role,
    timezone: body.timezone ?? "America/Los_Angeles"
  });

  return getAccountProfile(store, authUser);
}

export async function linkCaretakerToSenior(
  store,
  { caretakerId, seniorId, permissionLevel = "manager" },
  { strictSeniorLookup = true } = {}
) {
  const caretaker = await store.find("users", (user) => user.id === caretakerId && user.role === "caretaker");
  if (!caretaker) throw new HttpError(404, "Caretaker not found");

  const visibleSenior = await store.find("users", (user) => user.id === seniorId);
  if (visibleSenior && visibleSenior.role !== "senior") {
    throw new HttpError(400, `That account has role '${visibleSenior.role}', not 'senior'`);
  }
  if (strictSeniorLookup && !visibleSenior) {
    throw new HttpError(404, "Senior not found");
  }

  try {
    return await store.insert("careRelationships", {
      id: createId("rel"),
      caretakerId,
      seniorId,
      permissionLevel
    });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/foreign key|violates/i.test(message)) {
      throw new HttpError(404, `Senior not found for ID: ${seniorId}`);
    }
    throw error;
  }
}

export async function upsertSeniorForLink(store, identifier, timezone = "America/Los_Angeles") {
  const needle = normalizeLookupIdentifier(identifier);
  if (!needle) throw new HttpError(400, "Senior identifier is required");

  const users = await store.all("users");
  const existing = users.find((user) =>
    user.role === "senior" &&
    [user.id, user.authUserId, normalizeEmail(user.email), normalizePhone(user.phone)].some((field) =>
      normalizeLookupIdentifier(field) === needle
    )
  );
  if (existing) return existing;

  const email = needle.includes("@")
    ? needle
    : `linked-${needle.replace(/[^\d]/g, "") || Date.now()}@pawbot.local`;
  const phone = needle.startsWith("+") || /^\d[\d\s().-]*$/.test(needle)
    ? needle
    : "+10000000000";
  const name = needle.includes("@")
    ? needle.split("@")[0].replace(/[._-]+/g, " ").trim() || "Linked Senior"
    : "Linked Senior";

  return createUser(store, {
    name,
    phone,
    email,
    role: "senior",
    timezone
  });
}

export async function createMedication(store, body) {
  const senior = await store.find("users", (user) => user.id === body.seniorId && user.role === "senior");
  const creator = await store.find("users", (user) => user.id === body.createdBy);
  if (!senior) throw new HttpError(404, "Senior not found");
  if (!creator) throw new HttpError(404, "Creator not found");
  if (!Array.isArray(body.times) || body.times.length === 0) {
    throw new HttpError(400, "times must be a non-empty array like ['08:00', '20:00']");
  }

  return store.insert("medications", {
    id: createId("med"),
    seniorId: body.seniorId,
    createdBy: body.createdBy,
    name: body.name,
    dosage: body.dosage,
    instructions: body.instructions ?? "",
    times: body.times,
    frequency: body.frequency ?? "daily",
    active: body.active ?? true,
    createdAt: new Date().toISOString()
  });
}

export async function updateMedication(store, id, changes) {
  const medication = await store.update("medications", id, changes);
  if (!medication) throw new HttpError(404, "Medication not found");
  return medication;
}

export async function getMedicationsForSenior(store, seniorId) {
  return (await store.all("medications")).filter((medication) => medication.seniorId === seniorId);
}

export async function createMedicationLog(store, body) {
  return store.insert("medicationLogs", {
    id: createId("medlog"),
    medicationId: body.medicationId,
    seniorId: body.seniorId,
    scheduledFor: body.scheduledFor,
    status: body.status ?? "pending",
    sentAt: body.sentAt ?? null,
    confirmedAt: body.confirmedAt ?? null,
    replyText: body.replyText ?? null
  });
}

export async function markMedicationTaken(store, logId, replyText = "Manual confirmation") {
  const log = await store.update("medicationLogs", logId, {
    status: "taken",
    confirmedAt: new Date().toISOString(),
    replyText
  });
  if (!log) throw new HttpError(404, "Medication log not found");
  void writeAgentLog(store, log.seniorId, "medication_marked_taken", { logId }, { status: "taken" });
  return log;
}

export async function getTodayMedicationStatus(store, seniorId) {
  const senior = await store.find("users", (user) => user.id === seniorId);
  if (!senior) throw new HttpError(404, "Senior not found");

  const today = toDateKey(new Date(), senior.timezone);
  const medications = (await getMedicationsForSenior(store, seniorId)).filter((medication) => medication.active);
  const logs = (await store.all("medicationLogs")).filter((log) => log.seniorId === seniorId);

  return medications.flatMap((medication) => {
    return medication.times.map((time) => {
      const scheduledFor = scheduledIsoForLocalTime(today, time, senior.timezone);
      const log = logs.find((item) => item.medicationId === medication.id && item.scheduledFor === scheduledFor);
      return {
        medicationId: medication.id,
        medicationName: medication.name,
        dosage: medication.dosage,
        time,
        scheduledFor,
        status: log?.status ?? "pending",
        log: log ?? null
      };
    });
  });
}

async function latestActionableLog(store, seniorId) {
  const open = (await store.all("medicationLogs"))
    .filter((log) => log.seniorId === seniorId && ["sent", "pending"].includes(log.status))
    .sort((a, b) => new Date(b.scheduledFor) - new Date(a.scheduledFor));

  return open[0] ?? null;
}

export async function sendMedicationReminder(store, logId, { followUp = false } = {}) {
  const log = await store.find("medicationLogs", (item) => item.id === logId);
  if (!log) throw new HttpError(404, "Medication log not found");

  const senior = await store.find("users", (user) => user.id === log.seniorId);
  const medication = await store.find("medications", (item) => item.id === log.medicationId);
  if (!senior || !medication) throw new HttpError(404, "Senior or medication not found");

  const content = followUp
    ? `PawBot checking in: did you take ${medication.name} ${medication.dosage}? Reply YES, DONE, or TAKEN.`
    : `PawBot reminder: time to take ${medication.name} ${medication.dosage}. ${medication.instructions} Reply YES, DONE, or TAKEN when finished.`;

  const sendResult = await sendText({
    to: senior.phone,
    content,
    statusCallback: `${config.publicBaseUrl}/webhooks/sendblue/status`
  });

  const updated = await store.update("medicationLogs", log.id, {
    status: "sent",
    sentAt: log.sentAt ?? new Date().toISOString(),
    followUpSentAt: followUp ? new Date().toISOString() : log.followUpSentAt
  });

  void writeAgentLog(
    store,
    senior.id,
    followUp ? "medication_follow_up_sent" : "medication_reminder_sent",
    { medicationId: medication.id, logId: log.id, followUp },
    sendResult
  );

  return updated;
}

export async function escalateMissedMedication(store, logId) {
  const log = await store.find("medicationLogs", (item) => item.id === logId);
  if (!log) throw new HttpError(404, "Medication log not found");

  const senior = await store.find("users", (user) => user.id === log.seniorId);
  const medication = await store.find("medications", (item) => item.id === log.medicationId);
  const relationships = (await store.all("careRelationships")).filter((rel) => rel.seniorId === log.seniorId);
  const caretakers = (await Promise.all(
    relationships.map((rel) => store.find("users", (user) => user.id === rel.caretakerId))
  )).filter(Boolean);

  const results = [];
  for (const caretaker of caretakers) {
    results.push(await sendText({
      to: caretaker.phone,
      content: `PawBot alert: ${senior.name} has not confirmed ${medication.name} ${medication.dosage}. Please check in.`,
      statusCallback: `${config.publicBaseUrl}/webhooks/sendblue/status`
    }));
  }

  const updated = await store.update("medicationLogs", log.id, {
    status: "escalated"
  });

  void writeAgentLog(store, log.seniorId, "missed_medication_escalated", { logId, medicationId: medication.id }, { caretakersNotified: caretakers.length, results });
  void saveFactMemory(log.seniorId, "missed-dose-pattern", {
    medicationId: medication.id,
    medicationName: medication.name,
    dosage: medication.dosage,
    scheduledFor: log.scheduledFor,
    escalatedAt: new Date().toISOString(),
    caretakersNotified: caretakers.length
  });
  return updated;
}

export async function handleIncomingTextReply(store, payload) {
  const from = payload.from_number ?? payload.from ?? payload.number ?? payload.sender;
  const replyText = String(payload.content ?? payload.text ?? payload.body ?? "").trim();
  if (!from || !replyText) throw new HttpError(400, "Inbound text needs sender and content");

  const senior = await store.find("users", (user) => user.role === "senior" && user.phone === from);
  if (!senior) throw new HttpError(404, "No senior found for inbound phone number");

  const normalized = replyText.toUpperCase();
  const log = await latestActionableLog(store, senior.id);
  if (!log) {
    void writeAgentLog(store, senior.id, "unmatched_text_reply", { from, replyText }, { matched: false });
    return { matched: false, replyText };
  }

  if ([...TAKEN_REPLIES].some((accepted) => normalized.includes(accepted))) {
    return {
      matched: true,
      log: await markMedicationTaken(store, log.id, replyText)
    };
  }

  await store.update("medicationLogs", log.id, { replyText });
  void writeAgentLog(store, senior.id, "text_reply_received", { logId: log.id, replyText }, { matched: true, status: log.status });
  return { matched: true, log };
}

export async function createCalendarEvent(store, body) {
  return store.insert("calendarEvents", {
    id: createId("event"),
    seniorId: body.seniorId,
    createdBy: body.createdBy,
    title: body.title,
    eventType: body.eventType ?? "custom",
    date: body.date,
    recurrence: body.recurrence ?? null,
    reminderTime: body.reminderTime ?? "09:00"
  });
}

export async function getScamAlertsForSenior(store, seniorId) {
  return (await store.all("scamAlerts"))
    .filter((alert) => alert.seniorId === seniorId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getUpcomingCalendarEvents(store, seniorId) {
  const now = new Date();
  return (await store.all("calendarEvents"))
    .filter((event) => event.seniorId === seniorId && new Date(event.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export async function createScamAlert(store, body) {
  const alert = await store.insert("scamAlerts", {
    id: createId("scam"),
    seniorId: body.seniorId,
    source: body.source,
    riskLevel: body.riskLevel,
    summary: body.summary,
    actionTaken: body.actionTaken ?? "logged",
    caretakerNotified: body.caretakerNotified ?? false,
    createdAt: new Date().toISOString()
  });
  void writeAgentLog(store, body.seniorId, "scam_alert_created", { source: body.source, riskLevel: body.riskLevel }, alert);
  void saveFactMemory(body.seniorId, "scam-risk", {
    source: body.source,
    riskLevel: body.riskLevel,
    summary: body.summary,
    actionTaken: alert.actionTaken,
    caretakerNotified: alert.caretakerNotified,
    alertId: alert.id,
    createdAt: alert.createdAt
  });
  return alert;
}

export async function runMedicationAgentTick(store) {
  const now = new Date();
  const seniors = (await store.all("users")).filter((user) => user.role === "senior");
  const work = [];
  const summaries = [];

  for (const senior of seniors) {
    const dateKey = toDateKey(now, senior.timezone);
    const currentTime = toLocalTime(now, senior.timezone);
    const meds = (await getMedicationsForSenior(store, senior.id)).filter((medication) => medication.active);
    const memoryContext = await searchSeniorMemory(senior.id, "today medication");
    const allLogs = await store.all("medicationLogs");
    const summary = {
      seniorId: senior.id,
      dateKey,
      memoryContextLoaded: memoryContext.length,
      remindersSent: 0,
      followUpsSent: 0,
      confirmationsToday: allLogs
        .filter((log) => log.seniorId === senior.id && log.status === "taken" && toDateKey(new Date(log.confirmedAt ?? log.scheduledFor), senior.timezone) === dateKey)
        .length,
      escalations: 0
    };
    summaries.push(summary);

    for (const medication of meds) {
      for (const time of medication.times) {
        const scheduledFor = scheduledIsoForLocalTime(dateKey, time, senior.timezone);
        let log = allLogs.find((item) => item.medicationId === medication.id && item.scheduledFor === scheduledFor);

        if (!log && time <= currentTime) {
          log = await createMedicationLog(store, {
            medicationId: medication.id,
            seniorId: senior.id,
            scheduledFor
          });
          work.push(sendMedicationReminder(store, log.id).then((result) => {
            summary.remindersSent += 1;
            return result;
          }));
          continue;
        }

        if (!log || log.status === "taken" || log.status === "escalated") continue;

        const elapsed = minutesBetween(log.sentAt ?? log.scheduledFor, now);
        if (log.status === "sent" && elapsed >= config.agent.escalationMinutes) {
          work.push(escalateMissedMedication(store, log.id).then((result) => {
            summary.escalations += 1;
            return result;
          }));
        } else if (log.status === "sent" && !log.followUpSentAt && elapsed >= config.agent.followUpMinutes) {
          work.push(sendMedicationReminder(store, log.id, { followUp: true }).then((result) => {
            summary.followUpsSent += 1;
            return result;
          }));
        }
      }
    }
  }

  const results = await Promise.all(work);
  await Promise.all(summaries.map((summary) => saveEpisodicMemory(
    summary.seniorId,
    "medication_agent_tick_summary",
    { dateKey: summary.dateKey, ranAt: now.toISOString() },
    summary
  )));
  return results;
}
