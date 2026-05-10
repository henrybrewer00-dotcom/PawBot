const taskEl = document.getElementById("task");
const runBtn = document.getElementById("run-btn");
const stopBtn = document.getElementById("stop-btn");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const logEl = document.getElementById("log");
const settingsBtn = document.getElementById("settings-btn");
const clearBtn = document.getElementById("clear-btn");
const bridgeDot = document.getElementById("bridge-dot");
const bridgeText = document.getElementById("bridge-text");

async function updateBridgeStatus() {
  // Always wake / kick the worker first so the long-poll resumes.
  try { chrome.runtime.sendMessage({ type: "pawbot_kick_bridge" }, () => void chrome.runtime.lastError); } catch {}

  // Source of truth = the backend itself.
  try {
    const res = await fetch("http://localhost:4000/health", { cache: "no-store" });
    if (res.ok) {
      bridgeDot.className = "bridge-dot ok";
      bridgeText.textContent = "Connected to Pawbot app";
      return;
    }
    bridgeDot.className = "bridge-dot bad";
    bridgeText.textContent = `Backend HTTP ${res.status}`;
  } catch {
    bridgeDot.className = "bridge-dot bad";
    bridgeText.textContent = "Backend unreachable — run cd backend && npm run dev";
  }
}
updateBridgeStatus();
setInterval(updateBridgeStatus, 3000);

clearBtn.addEventListener("click", async () => {
  const tempPort = chrome.runtime.connect({ name: "agent" });
  tempPort.postMessage({ type: "clear" });
  setTimeout(() => { try { tempPort.disconnect(); } catch {} }, 200);
  logEl.innerHTML = "";
  appendLog("Memory cleared. Pawbot starts fresh.", "result");
});

let port = null;

function appendLog(text, kind = "") {
  const li = document.createElement("li");
  li.textContent = text;
  if (kind) li.classList.add(kind);
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}

function setRunning(running) {
  runBtn.disabled = running;
  stopBtn.classList.toggle("hidden", !running);
  statusEl.classList.toggle("hidden", !running);
  taskEl.disabled = running;
}

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

runBtn.addEventListener("click", async () => {
  const task = taskEl.value.trim();
  if (!task) {
    taskEl.focus();
    return;
  }

  setRunning(true);
  appendLog(`You: ${task}`);
  statusText.textContent = "Pawbot is on it…";

  port = chrome.runtime.connect({ name: "agent" });

  port.onMessage.addListener((msg) => {
    if (msg.type === "status") statusText.textContent = msg.text;
    else if (msg.type === "action") appendLog(msg.text, "action");
    else if (msg.type === "result") appendLog(msg.text, "result");
    else if (msg.type === "error") {
      appendLog(msg.text, "error");
      setRunning(false);
    } else if (msg.type === "done") {
      appendLog(msg.text, "done");
      setRunning(false);
    }
  });

  port.onDisconnect.addListener(() => {
    setRunning(false);
  });

  port.postMessage({ type: "run", task });
});

stopBtn.addEventListener("click", () => {
  if (port) port.postMessage({ type: "stop" });
  setRunning(false);
  statusText.textContent = "Stopped.";
});

taskEl.focus();
