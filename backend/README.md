# PawBot Backend

Node/Express backend for the always-on PawBot caretaker agent. The first complete loop is medication management: schedule medication, send a text reminder, accept a senior's text reply, escalate missed doses, and write agent memory logs.

## Setup

```sh
cp .env.example .env
npm install
npm run dev
```

The server starts at `http://localhost:4000`.

Sendblue texting is optional for local demos. Without credentials, outbound messages are logged as skipped demo sends.

## Environment

```sh
PORT=4000
PUBLIC_BASE_URL=http://localhost:4000
SENDBLUE_API_KEY=
SENDBLUE_API_SECRET=
SENDBLUE_FROM_NUMBER=
AGENT_POLL_SECONDS=30
MEDICATION_FOLLOW_UP_MINUTES=15
MEDICATION_ESCALATION_MINUTES=30
```

Sendblue's send-message API expects `content`, `from_number`, and recipient `number`, authenticated with `sb-api-key-id` and `sb-api-secret-key`.

## MVP Routes

| Backend function | Route |
| --- | --- |
| `createSenior` | `POST /api/seniors` |
| `createCaretaker` | `POST /api/caretakers` |
| `linkCaretakerToSenior` | `POST /api/care-relationships` |
| `createMedication` | `POST /api/medications` |
| `updateMedication` | `PATCH /api/medications/:id` |
| `getMedicationsForSenior` | `GET /api/seniors/:seniorId/medications` |
| `createMedicationLog` | `POST /api/medication-logs` |
| `markMedicationTaken` | `POST /api/medication-logs/:id/taken` |
| `getTodayMedicationStatus` | `GET /api/seniors/:seniorId/medication-status/today` |
| `sendMedicationReminder` | `POST /api/medication-logs/:id/send-reminder` |
| `handleIncomingTextReply` | `POST /webhooks/sendblue/inbound` |
| `escalateMissedMedication` | `POST /api/medication-logs/:id/escalate` |
| `createCalendarEvent` | `POST /api/calendar-events` |
| `getUpcomingCalendarEvents` | `GET /api/seniors/:seniorId/calendar-events/upcoming` |
| `createScamAlert` | `POST /api/scam-alerts` |
| `getAgentLogs` | `GET /api/seniors/:seniorId/agent-logs` |

Manual agent tick for demos:

```sh
curl -X POST http://localhost:4000/api/agent/tick
```

## Demo Flow

1. Create a caretaker.
2. Create a senior.
3. Link caretaker to senior.
4. Add a medication with a time at or before the current local time.
5. Run `POST /api/agent/tick`.
6. Simulate a Sendblue inbound reply:

```sh
curl -X POST http://localhost:4000/webhooks/sendblue/inbound \
  -H "Content-Type: application/json" \
  -d '{"from_number":"+15550000001","content":"DONE"}'
```

7. Check `GET /api/seniors/:seniorId/medication-status/today`.

## Security Notes

Medication and reminder data are stored in local JSON for the hackathon MVP. Do not store passwords, email credentials, payment cards, or medical secrets here. Those should move into a dedicated encrypted vault/tokenization layer with caregiver approval flows, audit trails, and least-privilege access.
