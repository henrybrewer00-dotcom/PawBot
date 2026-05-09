// Pawbot Browser content script — runs in every page.
// Currently a no-op stub; all actions are injected by the service worker via
// chrome.scripting.executeScript so we have a known, audited code path. Kept
// as a manifest entry so future enhancements (e.g. live overlays for the
// senior, "look here" highlights, captcha hints) can hook in here.

(() => {
  if (window.__pawbotContent) return;
  window.__pawbotContent = true;

  // Listen for highlight requests from the service worker so we can briefly
  // outline an element Pawbot is about to click — helps a senior follow along.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "pawbot_highlight" && msg.selector) {
      try {
        const el = document.querySelector(msg.selector);
        if (el) {
          const orig = el.style.outline;
          el.style.outline = "3px solid #2563eb";
          el.style.outlineOffset = "2px";
          setTimeout(() => { el.style.outline = orig; }, 800);
        }
      } catch {}
    }
    sendResponse?.({ ok: true });
    return true;
  });
})();
