# Pawbot Browser

A Chrome extension that drives the browser on behalf of an older adult. They
type a request in plain words ("open Netflix and help me sign in") and Pawbot
runs an agent loop with xAI Grok plus browser tools (navigate, click, type,
read-page, screenshot, scroll, get-email-code) until the task is done.

This is a starter scaffold built on Chrome Manifest V3. It is **not a fork of
Nanobrowser** — the architecture is intentionally small so you can read every
file and adapt it.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this `chrome-extension/` folder.
4. Click the Pawbot icon in the toolbar → **⚙ Settings** → paste your xAI
   Grok API key (get one at https://console.x.ai). Save.

## Use it

Click the Pawbot icon, type what you want done, hit **Go**.

Examples that work:

- *"Open Wikipedia and search for sea otters."*
- *"Go to my bank and tell me the account balance."* (Pawbot will stop and ask
  you to log in if it can't.)
- *"Open Netflix and start signing up — I'll give you the email and password
  when you ask."* (Pawbot will pause via the `done` tool to ask.)
- *"Find the verification code Netflix just emailed me and type it in."* (uses
  `get_latest_email_code`; you must already be signed into Gmail in another
  tab.)

## What's wired up

| Piece                          | File                                     |
| ------------------------------ | ---------------------------------------- |
| Manifest, permissions          | `manifest.json`                          |
| Popup UI (input + status feed) | `popup/popup.{html,css,js}`              |
| Options page (API key)         | `options/options.{html,js}`              |
| Agent loop + Grok tool calls   | `background/service-worker.js`           |
| Per-page hooks (highlights)    | `content/content.js`                     |

## Tools the agent has

| Name                       | What it does                                              |
| -------------------------- | --------------------------------------------------------- |
| `navigate(url)`            | Updates the active tab's URL.                             |
| `click({selector,text})`   | Clicks by CSS or by visible button/link text.             |
| `type_text({selector,text,submit})` | Sets value, fires input/change events, optional Enter. |
| `read_page()`              | Visible text + a curated list of interactable elements.   |
| `screenshot()`             | Captures the visible tab and runs vision via Grok-4.      |
| `scroll(direction)`        | up / down / top / bottom.                                 |
| `wait(seconds)`            | Pause for slow pages.                                     |
| `get_latest_email_code(from_contains)` | Opens Gmail, finds matching email, extracts a 4-8 digit code. |
| `done(answer)`             | Ends the loop with a plain-language message.              |

## Safety rails baked into the system prompt

- The user is older — answers must be in plain words, no jargon.
- Pawbot won't enter passwords unless the user typed them in the request.
- Risky steps (payments, "are you sure" confirmations) → stop and ask the
  user via `done()`.
- If a verification code is needed, prefer `get_latest_email_code` over
  guessing.

## Hooking up to the Pawbot Mac app (later)

Right now the extension reads its API key from `chrome.storage.local`. A
follow-up could have the Mac app expose the key on `http://localhost:4000`
and the extension's options page fetch it instead — keeps a single source
of truth across both surfaces.

## Known limitations

- `screenshot` uses the visible tab only (no full-page capture).
- The Gmail tool relies on the user being already logged into Gmail in
  Chrome. It clicks the first matching row, reads the body, regex-extracts
  a 4-8 digit number.
- Selector synthesis is naive: id, then `name`, then tag+type, then tag.
  For complex sites you may need to ask the user to land on a stable page
  first.
- Iteration limit is 25 by default in `service-worker.js`. Bump if you have
  a real long task.

## Adjusting the model

`TEXT_MODEL_FALLBACKS` and `VISION_MODEL` are at the top of
`background/service-worker.js`. Pawbot tries the first model and falls back
through the rest on 404/400.
