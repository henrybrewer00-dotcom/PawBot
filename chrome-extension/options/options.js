const dot = document.getElementById("status-dot");
const text = document.getElementById("status-text");
const detail = document.getElementById("status-detail");
const recheck = document.getElementById("recheck");

async function check() {
  dot.className = "dot";
  text.textContent = "Checking…";
  detail.textContent = "Asking the Pawbot backend for the xAI key…";
  try {
    const res = await fetch("http://localhost:4000/api/credentials/xai", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.key) {
        dot.className = "dot ok";
        text.textContent = "Connected";
        detail.textContent = `Key loaded from ${data.source ?? "backend"}. Ready to go.`;
        return;
      }
    }
    const err = await res.text();
    dot.className = "dot bad";
    text.textContent = `Backend up, but no key (HTTP ${res.status})`;
    detail.textContent = err.slice(0, 200);
  } catch (e) {
    dot.className = "dot bad";
    text.textContent = "Backend isn't reachable";
    detail.textContent = "Start it with: cd backend && npm run dev";
  }
}

recheck.addEventListener("click", check);
check();
