import assert from "node:assert/strict";
import test from "node:test";
import {
  createMedication,
  createUser,
  getTodayMedicationStatus,
  handleIncomingTextReply,
  linkCaretakerToSenior,
  runMedicationAgentTick
} from "../src/domain.js";

const emptyState = () => ({
  users: [],
  careRelationships: [],
  medications: [],
  medicationLogs: [],
  calendarEvents: [],
  scamAlerts: [],
  agentLogs: [],
  hyperspellConnections: []
});

class MemoryStore {
  constructor() {
    this.state = emptyState();
  }

  async all(collection) {
    return this.state[collection] ?? [];
  }

  async find(collection, predicate) {
    return (await this.all(collection)).find(predicate) ?? null;
  }

  async insert(collection, item) {
    this.state[collection].push(item);
    return item;
  }

  async update(collection, id, changes) {
    const items = await this.all(collection);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...changes };
    return items[index];
  }
}

function currentLocalTime(timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

test("medication reminder can be sent and confirmed by inbound text", async () => {
  const store = new MemoryStore();
  const timeZone = "America/Los_Angeles";

  const caretaker = await createUser(store, {
    name: "Demo Caretaker",
    phone: "+15550000002",
    email: "caretaker@example.com",
    role: "caretaker",
    timezone: timeZone
  });

  const senior = await createUser(store, {
    name: "Demo Senior",
    phone: "+15550000001",
    email: "senior@example.com",
    role: "senior",
    timezone: timeZone
  });

  await linkCaretakerToSenior(store, {
    caretakerId: caretaker.id,
    seniorId: senior.id
  });

  await createMedication(store, {
    seniorId: senior.id,
    createdBy: caretaker.id,
    name: "Vitamin D",
    dosage: "1 pill",
    instructions: "Take with water.",
    times: [currentLocalTime(timeZone)]
  });

  const tickResults = await runMedicationAgentTick(store);
  const sentStatus = await getTodayMedicationStatus(store, senior.id);

  assert.equal(tickResults.length, 1);
  assert.equal(sentStatus[0].status, "sent");

  const reply = await handleIncomingTextReply(store, {
    from_number: senior.phone,
    content: "DONE"
  });
  const takenStatus = await getTodayMedicationStatus(store, senior.id);

  assert.equal(reply.matched, true);
  assert.equal(takenStatus[0].status, "taken");
});
