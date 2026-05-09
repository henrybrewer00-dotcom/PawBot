// Pawbot Browser — agent service worker.
// Runs a tool-call loop with xAI Grok, executing browser actions via chrome APIs.

const SYSTEM_PROMPT = `You are Pawbot Browser, an AI agent driving a Chrome browser for an OLDER ADULT (65–90 years old). They asked you to do a task in plain words. Your job is to complete it step by step using the browser tools.

HARD RULES:
- The user is not technical. Do NOT explain what you're doing in jargon. Don't return raw HTML or selectors to them.
- Be careful and patient. Take one step, observe, then take the next.
- ALWAYS call read_page or screenshot after navigating or clicking, so you know what's actually on screen now. Don't guess.
- For sign-up / login flows: only use the user's real info if they provided it. If you need their email, password, or personal info that wasn't given, stop and ask via the done() tool.
- If a verification code is needed, use get_latest_email_code to find it from Gmail.
- When the task is finished (or you need user input), call the done() tool with a short, plain-language message — never with HTML or selectors.
- Never enter the user's password unless they explicitly typed it in the request.
- If you hit something risky (payment confirmation, "are you sure?" final step), stop and call done() asking for confirmation.

Use the tools below. Keep going until the task is done or you need the user.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigate the active tab to a URL. Use full URLs including https://.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
    }
  },
  {
    type: "function",
    function: {
      name: "click",
      description: "Click an element. Provide either a CSS selector OR visible text (one of them). Visible text is preferred when possible.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector" },
          text: { type: "string", description: "Visible text on the element to click (e.g., 'Sign In')" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "Type text into an input or textarea. Provide the CSS selector and the text to type. Will dispatch input events so frameworks pick it up.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          text: { type: "string" },
          submit: { type: "boolean", description: "If true, press Enter after typing" }
        },
        required: ["selector", "text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description: "Get the visible text and a list of interactable elements (buttons, inputs, links) of the current tab. Use this to understand what's on screen.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "screenshot",
      description: "Take a screenshot of the current visible tab and return it for vision analysis. Use only when read_page text isn't enough (e.g., when the page is mostly images or a captcha appears).",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description: "Scroll the page.",
      parameters: { type: "object", properties: { direction: { type: "string", enum: ["up", "down", "top", "bottom"] } }, required: ["direction"] }
    }
  },
  {
    type: "function",
    function: {
      name: "wait",
      description: "Wait for a number of seconds (useful after navigation or form submit).",
      parameters: { type: "object", properties: { seconds: { type: "number" } }, required: ["seconds"] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_latest_email_code",
      description: "Open Gmail in a new tab and find the latest 4-8 digit verification code from a sender matching the keyword. Returns the code as a string (or empty if none found).",
      parameters: { type: "object", properties: { from_contains: { type: "string" } }, required: ["from_contains"] }
    }
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Signal the task is complete OR ask the user for input. Provide a short plain-language message. The user is an older adult — no jargon.",
      parameters: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] }
    }
  }
];

const TEXT_MODEL_FALLBACKS = ["grok-4-fast-non-reasoning", "grok-4-0709", "grok-3", "grok-3-mini"];
const VISION_MODEL = "grok-4-0709";
const MAX_ITERATIONS = 25;

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

async function runAgent(task, port, isStopped) {
  const { xaiKey } = await chrome.storage.local.get(["xaiKey"]);
  if (!xaiKey) throw new Error("Missing xAI key. Open Settings.");

  port.postMessage({ type: "status", text: "Thinking…" });

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task }
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (isStopped()) {
      port.postMessage({ type: "error", text: "Stopped by user." });
      return;
    }

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
        port.postMessage({ type: "done", text: args.answer || "Done." });
        return;
      }
      port.postMessage({ type: "result", text: shortPreview(truncated) });
    }
  }
  port.postMessage({ type: "error", text: "Pawbot ran out of steps. Try a smaller request." });
}

function safeJSONParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function humanizeAction(name, args) {
  switch (name) {
    case "navigate": return `Going to ${args.url}`;
    case "click": return `Clicking ${args.text || args.selector || "something"}`;
    case "type_text": return `Typing "${(args.text || "").slice(0, 40)}…"`;
    case "read_page": return "Reading the page";
    case "screenshot": return "Taking a screenshot";
    case "scroll": return `Scrolling ${args.direction || "down"}`;
    case "wait": return `Waiting ${args.seconds || 1}s`;
    case "get_latest_email_code": return `Getting code from ${args.from_contains}…`;
    case "done": return "Wrapping up";
    default: return name;
  }
}

function shortPreview(s) {
  const oneLine = s.replace(/\s+/g, " ");
  return oneLine.length > 200 ? oneLine.slice(0, 197) + "…" : oneLine;
}

// =============================
// Grok call
// =============================
async function callGrok(apiKey, messages, tools, useVision = false) {
  const candidates = useVision ? [VISION_MODEL, "grok-4-fast-non-reasoning"] : TEXT_MODEL_FALLBACKS;
  let lastError = null;
  for (const model of candidates) {
    try {
      const body = {
        model,
        messages,
        temperature: 0.3,
        max_tokens: 800
      };
      if (tools && tools.length) {
        body.tools = tools;
        body.tool_choice = "auto";
      }
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
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
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab");
  return tab;
}

async function executeTool(name, args, xaiKey) {
  switch (name) {
    case "navigate": return await toolNavigate(args.url);
    case "click": return await toolClick(args);
    case "type_text": return await toolTypeText(args);
    case "read_page": return await toolReadPage();
    case "screenshot": return await toolScreenshot(xaiKey);
    case "scroll": return await toolScroll(args.direction || "down");
    case "wait": return await sleep((args.seconds || 1) * 1000), `Waited ${args.seconds || 1}s.`;
    case "get_latest_email_code": return await toolGetEmailCode(args.from_contains || "");
    case "done": return args.answer || "Done.";
    default: return `Unknown tool: ${name}`;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function toolNavigate(url) {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const tab = await getActiveTab();
  await chrome.tabs.update(tab.id, { url });
  await waitForLoad(tab.id);
  return `Navigated to ${url}.`;
}

function waitForLoad(tabId, timeoutMs = 12000) {
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

async function toolClick({ selector, text }) {
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel, txt) => {
      const findByText = (t) => {
        const tl = t.toLowerCase();
        const candidates = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='submit'], input[type='button'], label"));
        return candidates.find((el) => (el.innerText || el.value || "").trim().toLowerCase().includes(tl));
      };
      let target = null;
      if (sel) {
        try { target = document.querySelector(sel); } catch {}
      }
      if (!target && txt) target = findByText(txt);
      if (!target) return { ok: false, error: "Element not found" };
      target.scrollIntoView({ behavior: "instant", block: "center" });
      target.click();
      return { ok: true, tag: target.tagName };
    },
    args: [selector || null, text || null]
  });
  if (!result?.ok) return `Could not click — ${result?.error ?? "no element"}.`;
  await sleep(700);
  return `Clicked ${result.tag}.`;
}

async function toolTypeText({ selector, text, submit }) {
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel, value, doSubmit) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, error: "Input not found" };
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (doSubmit) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        if (el.form) el.form.submit?.();
      }
      return { ok: true };
    },
    args: [selector, text, !!submit]
  });
  if (!result?.ok) return `Could not type — ${result?.error ?? "no input"}.`;
  await sleep(300);
  return `Typed into ${selector}.`;
}

async function toolReadPage() {
  const tab = await getActiveTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const visText = (document.body?.innerText || "").slice(0, 5000);
      const interactables = [];
      const seen = new Set();
      document.querySelectorAll("a, button, input, textarea, select, [role='button']").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const tag = el.tagName.toLowerCase();
        const label = (el.innerText || el.value || el.placeholder || el.getAttribute("aria-label") || "").trim().slice(0, 80);
        const id = el.id || "";
        const name = el.name || "";
        const type = el.type || "";
        const sigKey = `${tag}|${label}|${id}|${name}`;
        if (seen.has(sigKey)) return;
        seen.add(sigKey);
        let selector = "";
        if (id) selector = `#${CSS.escape(id)}`;
        else if (name) selector = `${tag}[name="${name}"]`;
        else if (type) selector = `${tag}[type="${type}"]`;
        else selector = tag;
        interactables.push({ tag, label, selector, type });
      });
      return {
        url: location.href,
        title: document.title,
        text: visText,
        interactables: interactables.slice(0, 60)
      };
    }
  });
  if (!result) return "Could not read the page.";
  const lines = [
    `URL: ${result.url}`,
    `Title: ${result.title}`,
    `Visible text:\n${result.text.slice(0, 2500)}`,
    `Interactables:`,
    ...result.interactables.map((el, i) => `${i + 1}. <${el.tag}${el.type ? ` type=${el.type}` : ""}> "${el.label}" → ${el.selector}`)
  ];
  return lines.join("\n");
}

async function toolScreenshot(xaiKey) {
  const tab = await getActiveTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 70 });
  // Ask vision model what's on it
  const messages = [
    { role: "system", content: "You are describing a screenshot for an older adult. 2-3 short, plain sentences." },
    {
      role: "user",
      content: [
        { type: "text", text: "What's on this screen, and what stands out for the next step?" },
        { type: "image_url", image_url: { url: dataUrl } }
      ]
    }
  ];
  const resp = await callGrok(xaiKey, messages, [], true);
  return resp.content || "Captured screen but couldn't describe it.";
}

async function toolScroll(direction) {
  const tab = await getActiveTab();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (dir) => {
      switch (dir) {
        case "up": window.scrollBy({ top: -window.innerHeight * 0.8, behavior: "smooth" }); break;
        case "top": window.scrollTo({ top: 0, behavior: "smooth" }); break;
        case "bottom": window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); break;
        default: window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" });
      }
    },
    args: [direction]
  });
  await sleep(500);
  return `Scrolled ${direction}.`;
}

async function toolGetEmailCode(fromContains) {
  // Open Gmail in a new tab, find latest matching email, extract a 4-8 digit code.
  const original = await getActiveTab();
  const newTab = await chrome.tabs.create({ url: "https://mail.google.com/mail/u/0/#inbox", active: false });
  await waitForLoad(newTab.id, 15000);
  await sleep(2500);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: newTab.id },
    func: (needle) => {
      const rows = Array.from(document.querySelectorAll("tr.zA, div.zA"));
      const hit = rows.find((r) => (r.innerText || "").toLowerCase().includes(needle.toLowerCase()));
      if (!hit) return { ok: false, error: "No matching email row found" };
      hit.click();
      return { ok: true };
    },
    args: [fromContains]
  });
  if (!result?.ok) {
    chrome.tabs.remove(newTab.id);
    return `Couldn't find an email matching "${fromContains}". Make sure you're signed into Gmail.`;
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
