// Pawbot Browser — vision-driven agent service worker.
// Every turn: take a screenshot, hand it to Grok vision, Grok picks a tool,
// we execute it (mostly via x,y coordinate-based clicks like Claude Computer
// Use), then loop with a fresh screenshot. No CSS selectors required.

const SYSTEM_PROMPT = `You are Pawbot Browser, an AI agent driving a Chrome browser for an OLDER ADULT (65–90 years old).

YOU HAVE THE USER'S IDENTITY DIRECTLY:
- Email: henrybrewer00@gmail.com
- Password: niahack#26
- First name: Henry
- Last name: Brewer
Use these to fill any signup or sign-in form WITHOUT asking. You can also call get_identity() as a backup if you need the phone number or anything else.

ALWAYS ANNOUNCE THE CURRENT SITE in your reasoning: "I'm now on netflix.com" before deciding next step. The current URL is in every screenshot turn.

ACCOUNT MEMORY: For any login/signup page, FIRST call get_existing_account(domain) — if it returns an account, sign in with the stored email + password. If not, sign up using get_identity, then call record_account({domain, email}) once the account is created. This way the senior never has to track which sites they're on.

You SEE screenshots of the visible browser tab on every turn. Each user turn after the first contains the latest screenshot and the viewport size in CSS pixels.

You DRIVE the browser through tools. PREFER click_text over click(x,y) whenever the target has visible label text — it's faster and more accurate.
- click_text(text) — click an element by its visible text ("Sign In", "Continue", "Add to Cart"). USE THIS FIRST.
- click(x, y) — clicks at (x, y) in CSS pixels of the viewport. Only use when there's no readable text (icons, images). Screenshot is at 1:1 CSS pixel scale, so image coords map directly.
- type(text, submit) — types into whatever field is currently focused (click first if needed).
- key_press(key) — presses Enter, Tab, Escape, ArrowDown, etc.
- scroll(direction, amount) — scrolls up / down / top / bottom.
- navigate(url) — go to a URL.
- wait(seconds) — for slow pages.
- get_latest_email_code(from_contains) — opens Gmail in a new tab to grab a 4-8 digit code.
- read_page() — fallback: visible text dump if a screenshot is too dense.
- done(answer) — finish the task with a plain-language message to the user.

HARD RULES:
1. Look at the screenshot before deciding. Don't guess where things are.
2. Coordinates are CSS pixels of the visible viewport (top-left is 0,0). The viewport size is given in each turn — never click outside it.
3. Click the CENTER of the element, not the edge.
4. After every click that may change the page (links, submit buttons), expect to see a new screenshot next turn — wait or scroll if you don't.
5. The user is not technical. Never write jargon back to them. Don't say "selector" or "DOM" or pixel numbers — just say what you did.
6. Don't enter passwords, payment info, or personal data unless the user typed it in the request. Stop and ask via done() if anything is missing.
7. Risky steps (final purchase confirmation, account deletion, "are you sure?") → stop and ask the user via done().
8. If a verification code is needed, use get_latest_email_code rather than guessing.
9. When the task is finished or you need user input, call done(answer) — and answer in plain warm words.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "click",
      description: "Click at the given x,y in CSS pixels of the visible viewport. The viewport size is given each turn. The screenshot you see is rendered at exact viewport CSS scale (1 image px = 1 CSS px), so coordinates you read off the image map directly to clicks.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate in CSS pixels" },
          y: { type: "number", description: "Y coordinate in CSS pixels" }
        },
        required: ["x", "y"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "click_text",
      description: "Preferred for buttons / links: click an element by its visible text. Faster and more reliable than pixel coordinates. Use when the element shows readable label text (e.g. 'Sign In', 'Continue', 'Add to Cart').",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Exact or near-exact visible text (case-insensitive)" },
          tag: { type: "string", description: "Optional tag filter: button, a, input, label" }
        },
        required: ["text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "type",
      description: "Type text into the currently focused field. Click into the field first if it isn't focused.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          submit: { type: "boolean", description: "Press Enter after typing" }
        },
        required: ["text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "key_press",
      description: "Press a special key — Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, PageDown, PageUp.",
      parameters: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description: "Scroll the page.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["up", "down", "top", "bottom"] },
          amount: { type: "number", description: "Fraction of viewport to scroll (default 0.8)" }
        },
        required: ["direction"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigate the active tab to a URL. Include the full URL with https://.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
    }
  },
  {
    type: "function",
    function: {
      name: "wait",
      description: "Wait for some seconds.",
      parameters: { type: "object", properties: { seconds: { type: "number" } }, required: ["seconds"] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_latest_email_code",
      description: "Open Gmail and find the latest 4-8 digit verification code from a sender keyword. Returns the code as text. User must already be signed into Gmail.",
      parameters: {
        type: "object",
        properties: { from_contains: { type: "string" } },
        required: ["from_contains"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description: "Fallback: dump visible page text if a screenshot is hard to read. Don't use this for normal interaction.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "inject_css",
      description: "Inject CSS into the current page to change how it looks. Great for senior-friendly tweaks like 'make all text bigger', 'darken the background', 'increase line spacing'. The CSS is added to a Pawbot-managed style tag and persists for the tab's lifetime.",
      parameters: {
        type: "object",
        properties: { css: { type: "string", description: "Raw CSS text. Use !important if needed." } },
        required: ["css"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "make_text_bigger",
      description: "Quick shortcut: bump the page's text size site-wide. Use when the senior asks to make this site's text bigger.",
      parameters: {
        type: "object",
        properties: { factor: { type: "number", description: "Size multiplier, e.g. 1.5 for 50% bigger. Default 1.4." } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_identity",
      description: "Get the user's saved identity (email, password, first/last name, phone) from the Pawbot backend. Use this to fill any signup or sign-in form. Never ask the user for these directly.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_existing_account",
      description: "Check whether the user already has an account on a given site. Returns the stored email + status, or null if no account is on file. Always call this before deciding to sign up vs sign in.",
      parameters: {
        type: "object",
        properties: { domain: { type: "string", description: "Domain like netflix.com" } },
        required: ["domain"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "record_account",
      description: "Record that the user now has an account on a site. Call this AFTER a successful signup so future sign-in flows can reuse it.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string" },
          email: { type: "string" },
          notes: { type: "string", description: "Anything worth noting (paid plan, family share, etc.)" }
        },
        required: ["domain"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Finish — send a short, plain-language message to the user. Use this whenever the task is done OR you need user input (e.g. password).",
      parameters: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] }
    }
  }
];

const VISION_MODEL = "grok-4-0709";
const FALLBACK_MODELS = ["grok-4-fast-non-reasoning", "grok-4-0709"];
const MAX_ITERATIONS = 30;
const SCREENSHOT_MAX_WIDTH = 1024;
const SCREENSHOTS_TO_KEEP = 1; // only the latest screenshot is needed; older ones get text breadcrumbs

const PAWBOT_BACKEND_URL = "http://localhost:4000";
let cachedXaiKey = null;
let cachedXaiKeyAt = 0;

async function loadXaiKey() {
  const now = Date.now();
  if (cachedXaiKey && (now - cachedXaiKeyAt) < 5 * 60 * 1000) return cachedXaiKey;
  try {
    const res = await fetch(`${PAWBOT_BACKEND_URL}/api/credentials/xai`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.key) {
        cachedXaiKey = data.key;
        cachedXaiKeyAt = now;
        return cachedXaiKey;
      }
    }
  } catch {}
  return null;
}

let activeRun = null;
// Persist across Go presses AND service-worker restarts so the agent
// remembers prior tasks in the same browsing session. Stored in
// chrome.storage.session which survives worker termination but
// is wiped when Chrome itself closes. Reset via popup's "Clear" button.
let agentMessages = [];
let agentMessagesLoaded = false;
let bridgeRunning = false;

async function loadAgentMessages() {
  if (agentMessagesLoaded) return;
  try {
    const stored = await chrome.storage.session.get(["agentMessages"]);
    if (Array.isArray(stored?.agentMessages)) {
      agentMessages = stored.agentMessages;
    }
  } catch {}
  agentMessagesLoaded = true;
}

async function saveAgentMessages() {
  try {
    await chrome.storage.session.set({ agentMessages });
  } catch {}
}

async function clearAgentMessages() {
  agentMessages = [];
  try { await chrome.storage.session.remove("agentMessages"); } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  loadAgentMessages();
  startBridgePoller();
  try { chrome.alarms.create("pawbot-keepalive", { periodInMinutes: 0.5 }); } catch {}
});
chrome.runtime.onStartup.addListener(() => {
  loadAgentMessages();
  startBridgePoller();
  try { chrome.alarms.create("pawbot-keepalive", { periodInMinutes: 0.5 }); } catch {}
});
// Best-effort kick on every script load (worker may have just woken up).
loadAgentMessages();
startBridgePoller();
try { chrome.alarms.create("pawbot-keepalive", { periodInMinutes: 0.5 }); } catch {}

// Alarm fires every 30s and forces the poller back to life if it died.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pawbot-keepalive") {
    if (!bridgeRunning) {
      console.log("[Pawbot] keepalive alarm — bridge poller is stopped, restarting");
      startBridgePoller();
    }
  }
});

// Allow popup to query bridge status.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "pawbot_bridge_status") {
    sendResponse({
      connected: lastBridgeStatus.connected,
      lastSeenAt: lastBridgeStatus.lastSeenAt,
      lastError: lastBridgeStatus.lastError,
      bridgeRunning
    });
    return true;
  }
  if (msg?.type === "pawbot_kick_bridge") {
    if (!bridgeRunning) startBridgePoller();
    sendResponse({ bridgeRunning });
    return true;
  }
  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "agent") return;
  let stopped = false;

  port.onMessage.addListener(async (msg) => {
    if (msg.type === "run") {
      if (activeRun) return;
      activeRun = port;
      try {
        await runAgent(msg.task, port, () => stopped);
      } catch (err) {
        port.postMessage({ type: "error", text: `Pawbot hit a snag: ${err?.message ?? err}` });
      } finally {
        activeRun = null;
        try { port.disconnect(); } catch {}
      }
    } else if (msg.type === "stop") {
      stopped = true;
    } else if (msg.type === "clear") {
      await clearAgentMessages();
      port.postMessage({ type: "result", text: "Conversation cleared." });
    }
  });
});

// =============================
// Agent loop
// =============================
async function runAgent(task, port, isStopped) {
  const xaiKey = await loadXaiKey();
  if (!xaiKey) {
    throw new Error("Couldn't get an xAI key from the Pawbot backend. Make sure the Pawbot Mac app is running and the backend is up (cd backend && npm run dev).");
  }

  port.postMessage({ type: "status", text: "Looking at your browser…" });

  await sleep(400);
  const firstSnap = await snapshot();

  await loadAgentMessages();
  if (agentMessages.length === 0) {
    agentMessages.push({ role: "system", content: SYSTEM_PROMPT });
  }
  agentMessages.push({ role: "user", content: task });

  if (firstSnap.restricted) {
    agentMessages.push({
      role: "user",
      content: `The active tab is a Chrome internal page (${firstSnap.url}) which extensions can't see or interact with. Call navigate() to go to a real website first, then proceed.`
    });
  } else {
    agentMessages.push({
      role: "user",
      content: [
        { type: "text", text: buildSnapshotText(firstSnap, "current browser") },
        { type: "image_url", image_url: { url: firstSnap.dataUrl } }
      ]
    });
  }
  trimAgentMessages();
  const messages = agentMessages;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (isStopped()) {
      port.postMessage({ type: "error", text: "Stopped by user." });
      return;
    }

    port.postMessage({ type: "status", text: "Thinking…" });
    const response = await callGrok(xaiKey, messages, TOOLS);

    if (!response.toolCalls?.length) {
      const final = (response.content || "").trim() || "Done.";
      messages.push({ role: "assistant", content: final });
      await saveAgentMessages();
      port.postMessage({ type: "done", text: final });
      return;
    }

    messages.push({
      role: "assistant",
      content: response.content || "",
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.argumentsJSON }
      }))
    });

    let earlyExit = false;
    let exitMessage = "";
    for (const call of response.toolCalls) {
      if (isStopped()) {
        port.postMessage({ type: "error", text: "Stopped by user." });
        return;
      }
      const args = safeJSONParse(call.argumentsJSON) ?? {};
      port.postMessage({ type: "action", text: humanizeAction(call.name, args) });

      let result;
      try {
        result = await executeTool(call.name, args, xaiKey);
      } catch (err) {
        result = `Tool error: ${err?.message ?? err}`;
      }

      const truncated = typeof result === "string" ? result.slice(0, 4000) : JSON.stringify(result).slice(0, 4000);
      messages.push({ role: "tool", tool_call_id: call.id, content: truncated });

      if (call.name === "done") {
        earlyExit = true;
        exitMessage = args.answer || "Done.";
        break;
      }
      port.postMessage({ type: "result", text: shortPreview(truncated) });
    }

    if (earlyExit) {
      messages.push({ role: "assistant", content: exitMessage });
      await saveAgentMessages();
      port.postMessage({ type: "done", text: exitMessage });
      return;
    }

    // After all the tool calls, take a fresh screenshot and add it as the
    // next user turn. Prune older images first to keep token cost in check.
    pruneOldScreenshots(messages, SCREENSHOTS_TO_KEEP);
    await sleep(400);
    const fresh = await snapshot();
    if (fresh.restricted) {
      messages.push({
        role: "user",
        content: `The current tab is now a Chrome internal page (${fresh.url}) which extensions can't see. Call navigate() to a real URL.`
      });
    } else {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: buildSnapshotText(fresh, "updated browser") },
          { type: "image_url", image_url: { url: fresh.dataUrl } }
        ]
      });
    }
  }
  port.postMessage({ type: "error", text: "Pawbot ran out of steps. Try a smaller request." });
}

let lastBridgeStatus = { connected: false, lastSeenAt: null, lastError: null };

async function startBridgePoller() {
  if (bridgeRunning) {
    console.log("[Pawbot] bridge poller already running, skipping");
    return;
  }
  bridgeRunning = true;
  console.log("[Pawbot] bridge poller starting");
  try {
    while (bridgeRunning) {
      let task = null;
      try {
        const res = await fetch(`${PAWBOT_BACKEND_URL}/api/browser/tasks/next`, { cache: "no-store" });
        lastBridgeStatus = { connected: res.ok, lastSeenAt: Date.now(), lastError: res.ok ? null : `HTTP ${res.status}` };
        if (res.ok) {
          const data = await res.json();
          if (data?.id && data?.task) task = data;
        }
      } catch (err) {
        lastBridgeStatus = { connected: false, lastSeenAt: Date.now(), lastError: err?.message ?? String(err) };
        console.warn("[Pawbot] bridge fetch failed:", err?.message ?? err);
        await sleep(8000);
        continue;
      }
      if (!task) continue;
      console.log("[Pawbot] picked up task", task.id, ":", (task.task || "").slice(0, 80));
      if (activeRun) {
        await reportTaskResult(task.id, "Pawbot Browser was busy and couldn't take this task right now.");
        continue;
      }
      const result = await runTaskHeadless(task.task);
      await reportTaskResult(task.id, result);
      console.log("[Pawbot] reported result for", task.id);
    }
  } finally {
    bridgeRunning = false;
    console.log("[Pawbot] bridge poller stopped");
  }
}

async function reportTaskResult(id, result) {
  try {
    await fetch(`${PAWBOT_BACKEND_URL}/api/browser/tasks/${encodeURIComponent(id)}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result })
    });
  } catch {}
}

async function runTaskHeadless(task) {
  const fakePort = {
    postMessage: () => {},
    disconnect: () => {}
  };
  let finalText = "";
  fakePort.postMessage = (m) => {
    if (m?.type === "done") finalText = m.text;
    if (m?.type === "error" && !finalText) finalText = m.text;
  };
  try {
    activeRun = fakePort;
    await runAgent(task, fakePort, () => false);
  } catch (err) {
    finalText = `Pawbot Browser hit a snag: ${err?.message ?? err}`;
  } finally {
    activeRun = null;
  }
  return finalText || "Done.";
}

function trimAgentMessages(maxTurns = 30) {
  // Always keep the system message; cap the rest.
  const sys = agentMessages.find((m) => m.role === "system");
  const rest = agentMessages.filter((m) => m.role !== "system");
  if (rest.length <= maxTurns) return;
  const trimmed = rest.slice(rest.length - maxTurns);
  agentMessages.length = 0;
  if (sys) agentMessages.push(sys);
  agentMessages.push(...trimmed);
}

function pruneOldScreenshots(messages, keep) {
  // Walk backwards through messages, keep last `keep` user messages with
  // image_url content; replace earlier images with a text breadcrumb.
  let kept = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    const hasImage = m.content.some((c) => c?.type === "image_url");
    if (!hasImage) continue;
    if (kept < keep) {
      kept++;
      continue;
    }
    // Strip image, keep the text breadcrumb.
    m.content = m.content
      .filter((c) => c?.type !== "image_url")
      .concat([{ type: "text", text: "(earlier screenshot omitted to save tokens)" }]);
  }
}

// =============================
// Snapshot (capture + dims)
// =============================
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab");
  return tab;
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|brave|vivaldi|opera|moz-extension|view-source|about|file|devtools):/i.test(url);
}

async function snapshot() {
  const tab = await getActiveTab();
  const tinyPNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  if (isRestrictedUrl(tab.url)) {
    return {
      width: 1280,
      height: 800,
      dpr: 1,
      url: tab.url ?? "(unknown)",
      title: tab.title ?? "",
      dataUrl: tinyPNG,
      tabId: tab.id,
      restricted: true
    };
  }

  let vp;
  let interactables = [];
  try {
    const [out] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const grab = (el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) return null;
          if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
          if (rect.right < 0 || rect.left > window.innerWidth) return null;
          const label = (el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().slice(0, 60);
          return {
            tag: el.tagName.toLowerCase(),
            type: el.type || null,
            label,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2)
          };
        };
        const list = [];
        const seen = new Set();
        document.querySelectorAll("a, button, [role='button'], input, textarea, select, label").forEach((el) => {
          const e = grab(el);
          if (!e) return;
          const sig = `${e.tag}|${e.type}|${e.label}|${e.x},${e.y}`;
          if (seen.has(sig)) return;
          seen.add(sig);
          list.push(e);
        });
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
          url: location.href,
          title: document.title,
          interactables: list.slice(0, 40)
        };
      }
    });
    vp = out.result;
    interactables = vp.interactables ?? [];
  } catch (err) {
    return {
      width: 1280,
      height: 800,
      dpr: 1,
      url: tab.url ?? "(unknown)",
      title: tab.title ?? "",
      dataUrl: tinyPNG,
      tabId: tab.id,
      restricted: true
    };
  }
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 65 });
  } catch (err) {
    dataUrl = tinyPNG;
  }
  let imgWidth = vp.width * (vp.dpr || 1);
  let imgHeight = vp.height * (vp.dpr || 1);
  try {
    const out = await downscale(dataUrl, SCREENSHOT_MAX_WIDTH);
    dataUrl = out.dataUrl;
    imgWidth = out.width;
    imgHeight = out.height;
  } catch {}
  lastSnapDims = { imgWidth, imgHeight, cssWidth: vp.width, cssHeight: vp.height };
  return { ...vp, dataUrl, tabId: tab.id, imgWidth, imgHeight, interactables };
}

let lastSnapDims = null;

function buildSnapshotText(snap, label = "browser") {
  const lines = [
    `Here is the ${label}.`,
    `URL: ${snap.url}`,
    `Viewport: ${snap.width}x${snap.height} CSS pixels. Image: ${snap.imgWidth}x${snap.imgHeight} px.`
  ];
  if (Array.isArray(snap.interactables) && snap.interactables.length > 0) {
    lines.push("");
    lines.push("Interactable elements (use click_text(label) — preferred — or click(x,y) at the listed image coords):");
    for (const e of snap.interactables) {
      const labelTxt = e.label ? `"${e.label}"` : "";
      lines.push(`- <${e.tag}${e.type ? ` type=${e.type}` : ""}> ${labelTxt} @ (${e.x},${e.y})`);
    }
  }
  return lines.join("\n");
}

async function downscale(dataUrl, maxWidth) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width <= maxWidth) {
    return { dataUrl, width: bitmap.width, height: bitmap.height };
  }
  const scale = maxWidth / bitmap.width;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  const buf = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { dataUrl: "data:image/jpeg;base64," + btoa(bin), width: w, height: h };
}

// =============================
// Grok call
// =============================
async function callGrok(apiKey, messages, tools) {
  let lastError = null;
  // Vision-capable model first; fallbacks for text-only paths.
  for (const model of FALLBACK_MODELS) {
    try {
      const body = {
        model,
        messages,
        temperature: 0.1,
        max_tokens: 500
      };
      if (tools?.length) {
        body.tools = tools;
        body.tool_choice = "auto";
      }
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 404 || res.status === 400) { lastError = new Error(`HTTP ${res.status} ${text.slice(0, 200)}`); continue; }
        throw new Error(`HTTP ${res.status} ${text.slice(0, 280)}`);
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message ?? {};
      const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function?.name,
        argumentsJSON: tc.function?.arguments ?? "{}"
      }));
      return { content: msg.content, toolCalls };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Grok call failed");
}

// =============================
// Tool execution
// =============================
async function executeTool(name, args, xaiKey) {
  switch (name) {
    case "click": return await toolClick(args.x, args.y);
    case "click_text": return await toolClickText(args.text || "", args.tag);
    case "type": return await toolType(args.text, args.submit === true);
    case "key_press": return await toolKeyPress(args.key);
    case "scroll": return await toolScroll(args.direction || "down", args.amount ?? 0.8);
    case "navigate": return await toolNavigate(args.url);
    case "wait": await sleep((args.seconds || 1) * 1000); return `Waited ${args.seconds || 1}s.`;
    case "get_latest_email_code": return await toolGetEmailCode(args.from_contains || "");
    case "read_page": return await toolReadPage();
    case "inject_css": return await toolInjectCSS(args.css || "");
    case "make_text_bigger": return await toolMakeTextBigger(args.factor ?? 1.4);
    case "get_identity": return await toolGetIdentity();
    case "get_existing_account": return await toolGetExistingAccount(args.domain || "");
    case "record_account": return await toolRecordAccount(args);
    case "done": return args.answer || "Done.";
    default: return `Unknown tool: ${name}`;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function safeJSONParse(s) { try { return JSON.parse(s); } catch { return null; } }

function humanizeAction(name, args) {
  switch (name) {
    case "click": return `Clicking at (${Math.round(args.x)}, ${Math.round(args.y)})`;
    case "type": return `Typing "${(args.text || "").slice(0, 40)}${args.submit ? " ⏎" : ""}"`;
    case "key_press": return `Pressing ${args.key}`;
    case "scroll": return `Scrolling ${args.direction}`;
    case "navigate": return `Going to ${args.url}`;
    case "wait": return `Waiting ${args.seconds}s`;
    case "get_latest_email_code": return `Looking up code from ${args.from_contains}…`;
    case "read_page": return "Reading page text";
    case "done": return "Wrapping up";
    default: return name;
  }
}

function shortPreview(s) {
  const oneLine = s.replace(/\s+/g, " ");
  return oneLine.length > 200 ? oneLine.slice(0, 197) + "…" : oneLine;
}

async function toolClick(x, y) {
  // Coordinates from Grok are in IMAGE pixels (because that's what they see).
  // Convert to viewport CSS pixels using the latest snapshot's scale before
  // calling document.elementFromPoint (which expects CSS pixels).
  const dims = lastSnapDims;
  let cssX = x;
  let cssY = y;
  if (dims && dims.imgWidth > 0 && dims.imgHeight > 0) {
    cssX = x * (dims.cssWidth / dims.imgWidth);
    cssY = y * (dims.cssHeight / dims.imgHeight);
  }
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (px, py) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return { ok: false, error: `No element at (${px}, ${py})` };
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const tag = el.tagName.toLowerCase();
      const label = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 80);
      if (typeof el.focus === "function") el.focus();
      el.click();
      return { ok: true, tag, label };
    },
    args: [cssX, cssY]
  });
  await sleep(700);
  if (!result?.ok) return result?.error ?? "Click missed.";
  return `Clicked <${result.tag}> "${result.label}" (image ${Math.round(x)},${Math.round(y)} → CSS ${Math.round(cssX)},${Math.round(cssY)}).`;
}

async function toolClickText(text, tag) {
  if (!text) return "text is required";
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (needle, tagFilter) => {
      const lower = needle.toLowerCase();
      const tagsToScan = tagFilter
        ? [tagFilter.toLowerCase()]
        : ["button", "a", "[role='button']", "input[type='submit']", "input[type='button']", "label", "div[role='button']"];
      const selector = tagsToScan.join(", ");
      const visibleAndMatches = (el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const label = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().toLowerCase();
        return label.includes(lower);
      };
      const matches = Array.from(document.querySelectorAll(selector)).filter(visibleAndMatches);
      if (matches.length === 0) {
        // Loose fallback — any element whose innerText contains the needle
        const looseMatches = Array.from(document.querySelectorAll("*"))
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && (el.innerText || "").trim().toLowerCase() === lower;
          });
        if (looseMatches.length === 0) return { ok: false, error: `No element with visible text "${needle}"` };
        const target = looseMatches[0];
        target.scrollIntoView({ block: "center" });
        target.click();
        return { ok: true, tag: target.tagName.toLowerCase(), label: (target.innerText || "").trim().slice(0, 60) };
      }
      // Prefer shortest label match (most specific)
      matches.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
      const target = matches[0];
      target.scrollIntoView({ block: "center" });
      if (typeof target.focus === "function") target.focus();
      target.click();
      return { ok: true, tag: target.tagName.toLowerCase(), label: (target.innerText || target.value || "").trim().slice(0, 60) };
    },
    args: [text, tag ?? null]
  });
  await sleep(700);
  if (!result?.ok) return result?.error ?? "click_text failed";
  return `Clicked <${result.tag}> "${result.label}".`;
}

async function toolType(text, submit) {
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (value, doSubmit) => {
      const el = document.activeElement;
      if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) {
        return { ok: false, error: "No focused input. Click into the field first." };
      }
      if (el.isContentEditable) {
        el.textContent = value;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
      } else {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(el, value); else el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (doSubmit) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
        if (!el.isContentEditable && el.form) el.form.requestSubmit?.();
      }
      return { ok: true };
    },
    args: [text, !!submit]
  });
  await sleep(300);
  if (!result?.ok) return result?.error ?? "Type failed.";
  return `Typed (${text.length} chars)${submit ? " and pressed Enter" : ""}.`;
}

async function toolKeyPress(key) {
  const tab = await getActiveTab();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (k) => {
      const el = document.activeElement || document.body;
      const opts = { key: k, bubbles: true };
      el.dispatchEvent(new KeyboardEvent("keydown", opts));
      el.dispatchEvent(new KeyboardEvent("keypress", opts));
      el.dispatchEvent(new KeyboardEvent("keyup", opts));
    },
    args: [key]
  });
  await sleep(250);
  return `Pressed ${key}.`;
}

async function toolScroll(direction, amount) {
  const tab = await getActiveTab();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (dir, amt) => {
      const px = window.innerHeight * amt;
      switch (dir) {
        case "up": window.scrollBy({ top: -px, behavior: "smooth" }); break;
        case "top": window.scrollTo({ top: 0, behavior: "smooth" }); break;
        case "bottom": window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); break;
        default: window.scrollBy({ top: px, behavior: "smooth" });
      }
    },
    args: [direction, amount]
  });
  await sleep(500);
  return `Scrolled ${direction}.`;
}

async function toolNavigate(url) {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const tab = await getActiveTab();
  await chrome.tabs.update(tab.id, { url });
  await waitForLoad(tab.id);
  return `Navigated to ${url}.`;
}

function waitForLoad(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = async () => {
      try {
        const t = await chrome.tabs.get(tabId);
        if (t.status === "complete") return resolve();
      } catch {}
      if (Date.now() - start > timeoutMs) return resolve();
      setTimeout(check, 250);
    };
    check();
  });
}

async function toolReadPage() {
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || "").slice(0, 6000)
    })
  });
  if (!result) return "Could not read the page.";
  return `URL: ${result.url}\nTitle: ${result.title}\n\n${result.text}`;
}

async function toolInjectCSS(css) {
  if (!css || typeof css !== "string") return "No CSS provided.";
  const tab = await getActiveTab();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (rules) => {
      const ID = "__pawbot_injected_css";
      let styleEl = document.getElementById(ID);
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = ID;
        document.documentElement.appendChild(styleEl);
      }
      styleEl.textContent += "\n" + rules;
    },
    args: [css]
  });
  return `Applied CSS (${css.length} chars).`;
}

async function toolMakeTextBigger(factor) {
  const f = Math.max(1.0, Math.min(3.0, Number(factor) || 1.4));
  const css = `html { font-size: ${Math.round(f * 100)}% !important; } body, p, li, a, span, div, h1, h2, h3, h4, h5, h6, button, input, label { line-height: 1.5 !important; }`;
  return await toolInjectCSS(css);
}

async function toolGetIdentity() {
  try {
    const res = await fetch(`${PAWBOT_BACKEND_URL}/api/credentials/identity`, { cache: "no-store" });
    if (!res.ok) return `Identity unavailable (HTTP ${res.status}). Check backend/.env for PAWBOT_USER_EMAIL / PAWBOT_USER_PASSWORD.`;
    const data = await res.json();
    if (!data?.email && !data?.password) return "No identity is configured. Set PAWBOT_USER_EMAIL and PAWBOT_USER_PASSWORD in backend/.env.";
    return JSON.stringify({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone
    });
  } catch (e) {
    return `Identity fetch failed: ${e?.message ?? e}`;
  }
}

async function toolGetExistingAccount(domain) {
  if (!domain) return "domain is required";
  try {
    const res = await fetch(`${PAWBOT_BACKEND_URL}/api/sites/accounts/${encodeURIComponent(domain)}`, { cache: "no-store" });
    if (!res.ok) return `Lookup failed (HTTP ${res.status})`;
    const data = await res.json();
    if (!data?.account) return "null";
    return JSON.stringify(data.account);
  } catch (e) {
    return `Lookup failed: ${e?.message ?? e}`;
  }
}

async function toolRecordAccount(args) {
  const domain = args?.domain;
  if (!domain) return "domain is required";
  try {
    const res = await fetch(`${PAWBOT_BACKEND_URL}/api/sites/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, email: args.email, notes: args.notes })
    });
    if (!res.ok) return `Record failed (HTTP ${res.status})`;
    const data = await res.json();
    return JSON.stringify(data.account);
  } catch (e) {
    return `Record failed: ${e?.message ?? e}`;
  }
}

async function toolGetEmailCode(fromContains) {
  const original = await getActiveTab();
  const newTab = await chrome.tabs.create({ url: "https://mail.google.com/mail/u/0/#inbox", active: false });
  await waitForLoad(newTab.id, 15000);
  await sleep(2500);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: newTab.id },
    func: (needle) => {
      const rows = Array.from(document.querySelectorAll("tr.zA, div.zA"));
      const hit = rows.find((r) => (r.innerText || "").toLowerCase().includes(needle.toLowerCase()));
      if (!hit) return { ok: false, error: "No matching email" };
      hit.click();
      return { ok: true };
    },
    args: [fromContains]
  });
  if (!result?.ok) {
    chrome.tabs.remove(newTab.id);
    return `Couldn't find email matching "${fromContains}". Make sure you're signed into Gmail.`;
  }
  await sleep(2500);
  const [{ result: bodyResult }] = await chrome.scripting.executeScript({
    target: { tabId: newTab.id },
    func: () => (document.body?.innerText || "").slice(0, 8000)
  });
  chrome.tabs.remove(newTab.id);
  await chrome.tabs.update(original.id, { active: true });
  if (!bodyResult) return "Couldn't read the email.";
  const match = bodyResult.match(/\b(\d{4,8})\b/);
  return match ? `Code: ${match[1]}` : "Couldn't find a numeric code in that email.";
}
