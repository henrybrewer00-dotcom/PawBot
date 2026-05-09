import assert from "node:assert/strict";
import test from "node:test";
import {
  createMedication,
  createUser,
  getSeniorPersonalInfo,
  getTodayMedicationStatus,
  handleIncomingTextReply,
  linkCaretakerToSenior,
  runMedicationAgentTick,
  upsertSeniorForLink,
  upsertSeniorPersonalInfo
} from "../src/domain.js";
import {
  normalizeEmail,
  normalizeLookupIdentifier,
  normalizePhone
} from "../src/identity.js";

const emptyState = () => ({
  users: [],
  careRelationships: [],
  medications: [],
  medicationLogs: [],
  calendarEvents: [],
  scamAlerts: [],
  agentLogs: [],
  hyperspellConnections: [],
  seniorPersonalInfo: []
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

test("caretaker can link a senior by ID even when the senior lookup is indirect", async () => {
  const store = new MemoryStore();
  const caretaker = await createUser(store, {
    name: "Demo Caretaker",
    phone: "+15550000002",
    email: "caretaker@example.com",
    role: "caretaker"
  });
  const senior = await createUser(store, {
    name: "Demo Senior",
    phone: "+15550000001",
    email: "senior@example.com",
    role: "senior"
  });

  const lookupStore = {
    async find(collection, predicate) {
      if (collection !== "users") return store.find(collection, predicate);
      const rows = await store.all(collection);
      return rows.find((row) => row.id === caretaker.id && predicate(row)) ?? null;
    },
    all(collection) {
      return store.all(collection);
    },
    insert(collection, item) {
      return store.insert(collection, item);
    },
    update(collection, id, changes) {
      return store.update(collection, id, changes);
    }
  };

  const rel = await linkCaretakerToSenior(
    lookupStore,
    { caretakerId: caretaker.id, seniorId: senior.id },
    { strictSeniorLookup: false }
  );

  assert.equal(rel.caretakerId, caretaker.id);
  assert.equal(rel.seniorId, senior.id);
  assert.equal(store.state.careRelationships.length, 1);
});

test("identity normalization matches email and phone variants", async () => {
  assert.equal(normalizeEmail("Senior@Example.COM "), "senior@example.com");
  assert.equal(normalizePhone("(555) 000-0001"), "5550000001");
  assert.equal(normalizeLookupIdentifier(" SENIOR@Example.com "), "senior@example.com");
  assert.equal(normalizeLookupIdentifier(" +1 (555) 000-0001 "), "+15550000001");
});

test("upsertSeniorForLink creates a senior when the email is not already in users", async () => {
  const store = new MemoryStore();
  const senior = await upsertSeniorForLink(store, "brewert1@uci.edu", "America/Los_Angeles");

  assert.equal(senior.role, "senior");
  assert.equal(senior.email, "brewert1@uci.edu");
  assert.equal(store.state.users.length, 1);
  assert.equal(store.state.users[0].email, "brewert1@uci.edu");
});

test("senior personal info saves public metadata and agent-readable credentials", async () => {
  const store = new MemoryStore();
  const senior = await createUser(store, {
    name: "Demo Senior",
    phone: "+15550000001",
    email: "senior@example.com",
    role: "senior"
  });

  const saved = await upsertSeniorPersonalInfo(store, senior.id, {
    email: "personal@example.com",
    password: "demo-password"
  });
  const publicInfo = await getSeniorPersonalInfo(store, senior.id);
  const agentInfo = await getSeniorPersonalInfo(store, senior.id, { includePassword: true });

  assert.equal(saved.email, "personal@example.com");
  assert.equal(saved.hasPassword, true);
  assert.equal(publicInfo.password, undefined);
  assert.equal(agentInfo.password, "demo-password");
});
