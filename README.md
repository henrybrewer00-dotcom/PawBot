# PawBot

PawBot is a native macOS front-end prototype for an always-available assistant designed for older adults.

The prototype focuses on:

- A quiet side tab that stays available on screen
- A semi-transparent SwiftUI assistant panel
- Slower, calmer animations
- Large, readable controls
- Dismissible notification mockups
- Design mockup images in `Assets/Design Mockups`

This is only a front-end prototype. The buttons and assistant features are visual placeholders.

## Backend MVP

The `backend/` folder contains the first always-on agent loop for medication management:

- Senior and caretaker creation
- Care relationship linking
- Medication schedules
- Medication reminder logs
- Background reminder checks
- Sendblue-ready outbound text reminders
- Inbound text reply handling for `YES`, `DONE`, and `TAKEN`
- Missed-dose escalation to caretakers
- Calendar event and scam alert placeholders
- Agent logs for everything the background worker does

Run it locally:

```sh
cd backend
cp .env.example .env
npm install
npm run dev
```

The API listens on `http://localhost:4000`. If Sendblue credentials are not configured, text sending runs in demo mode and records what would have been sent.
