import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";
import {
  createMedication,
  createUser,
  getTodayMedicationStatus,
  handleIncomingTextReply,
  linkCaretakerToSenior,
  runMedicationAgentTick
} from "../src/domain.js";

function currentLocalTime(timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

test("medication reminder can be sent and confirmed by inbound text", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pawbot-test-"));
  const store = new JsonStore(path.join(tempDir, "db.json"));
  const timeZone = "America/Los_Angeles";

  const caretaker = createUser(store, {
    name: "Demo Caretaker",
    phone: "+15550000002",
    email: "caretaker@example.com",
    role: "caretaker",
    timezone: timeZone
  });

  const senior = createUser(store, {
    name: "Demo Senior",
    phone: "+15550000001",
    email: "senior@example.com",
    role: "senior",
    timezone: timeZone
  });

  linkCaretakerToSenior(store, {
    caretakerId: caretaker.id,
    seniorId: senior.id
  });

  createMedication(store, {
    seniorId: senior.id,
    createdBy: caretaker.id,
    name: "Vitamin D",
    dosage: "1 pill",
    instructions: "Take with water.",
    times: [currentLocalTime(timeZone)]
  });

  const tickResults = await runMedicationAgentTick(store);
  const sentStatus = getTodayMedicationStatus(store, senior.id);

  assert.equal(tickResults.length, 1);
  assert.equal(sentStatus[0].status, "sent");

  const reply = await handleIncomingTextReply(store, {
    from_number: senior.phone,
    content: "DONE"
  });
  const takenStatus = getTodayMedicationStatus(store, senior.id);

  assert.equal(reply.matched, true);
  assert.equal(takenStatus[0].status, "taken");
});
