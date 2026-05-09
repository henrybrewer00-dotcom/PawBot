// Pawbot Browser — vision-driven agent service worker.
// Every turn: take a screenshot, hand it to Grok vision, Grok picks a tool,
// we execute it (mostly via x,y coordinate-based clicks like Claude Computer
// Use), then loop with a fresh screenshot. No CSS selectors required.

const SYSTEM_PROMPT = `You are Pawbot Browser, an AI agent driving a Chrome browser for an OLDER ADULT (65–90 years old).

You SEE screenshots of the visible browser tab on every turn. Each user turn after the first contains the latest screenshot and the viewport size in CSS pixels.

You DRIVE the browser through tools that take pixel coordinates:
- click(x, y) — clicks at (x, y) in CSS pixels of the viewport in the screenshot.
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
      description: "Click at the given x,y in CSS pixels of the visible viewport. The viewport size is given each turn.",
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
      name: "done",
      description: "Finish — send a short, plain-language message to the user. Use this whenever the task is done OR you need user input (e.g. password).",
      parameters: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] }
    }
  }
];

const VISION_MODEL = "grok-4-0709";
const FALLBACK_MODELS = ["grok-4-fast-non-reasoning", "grok-4-0709"];
const MAX_ITERATIONS = 30;
const SCREENSHOT_MAX_WIDTH = 1280;
const SCREENSHOTS_TO_KEEP = 2; // images cost tokens, prune older ones

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

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task },
    {
      role: "user",
      content: [
        { type: "text", text: `Here is the current browser. URL: ${firstSnap.url}\nViewport: ${firstSnap.width}x${firstSnap.height} CSS pixels.` },
        { type: "image_url", image_url: { url: firstSnap.dataUrl } }
      ]
    }
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (isStopped()) {
      port.postMessage({ type: "error", text: "Stopped by user." });
      return;
    }

    port.postMessage({ type: "status", text: "Thinking…" });
    const response = await callGrok(xaiKey, messages, TOOLS);

    if (!response.toolCalls?.length) {
      const final = (response.content || "").trim() || "Done.";
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
      port.postMessage({ type: "done", text: exitMessage });
      return;
    }

    // After all the tool calls, take a fresh screenshot and add it as the
    // next user turn. Prune older images first to keep token cost in check.
    pruneOldScreenshots(messages, SCREENSHOTS_TO_KEEP);
    await sleep(400);
    const fresh = await snapshot();
    messages.push({
      role: "user",
      content: [
        { type: "text", text: `Updated screen. URL: ${fresh.url}\nViewport: ${fresh.width}x${fresh.height} CSS pixels.` },
        { type: "image_url", image_url: { url: fresh.dataUrl } }
      ]
    });
  }
  port.postMessage({ type: "error", text: "Pawbot ran out of steps. Try a smaller request." });
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

async function snapshot() {
  const tab = await getActiveTab();
  const [{ result: vp }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
      url: location.href,
      title: document.title
    })
  });
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 });
  } catch (err) {
    // captureVisibleTab fails on internal pages; return a tiny placeholder
    dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  }
  // Downscale to keep token cost manageable.
  try {
    dataUrl = await downscale(dataUrl, SCREENSHOT_MAX_WIDTH);
  } catch {}
  return { ...vp, dataUrl, tabId: tab.id };
}

async function downscale(dataUrl, maxWidth) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width <= maxWidth) return dataUrl;
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
  return "data:image/jpeg;base64," + btoa(bin);
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
        temperature: 0.2,
        max_tokens: 800
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
    case "type": return await toolType(args.text, args.submit === true);
    case "key_press": return await toolKeyPress(args.key);
    case "scroll": return await toolScroll(args.direction || "down", args.amount ?? 0.8);
    case "navigate": return await toolNavigate(args.url);
    case "wait": await sleep((args.seconds || 1) * 1000); return `Waited ${args.seconds || 1}s.`;
    case "get_latest_email_code": return await toolGetEmailCode(args.from_contains || "");
    case "read_page": return await toolReadPage();
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
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (px, py) => {
      const el = document.elementFromPoint(px, py);
      if (!el) return { ok: false, error: `No element at (${px}, ${py})` };
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const tag = el.tagName.toLowerCase();
      const label = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 80);
      // Focus inputs so subsequent type() lands here
      if (typeof el.focus === "function") el.focus();
      el.click();
      return { ok: true, tag, label };
    },
    args: [x, y]
  });
  await sleep(700);
  if (!result?.ok) return result?.error ?? "Click missed.";
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
