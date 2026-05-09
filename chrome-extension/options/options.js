const keyInput = document.getElementById("key");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

(async () => {
  const stored = await chrome.storage.local.get(["xaiKey"]);
  if (stored.xaiKey) keyInput.value = stored.xaiKey;
})();

saveBtn.addEventListener("click", async () => {
  const v = keyInput.value.trim();
  if (!v) {
    statusEl.textContent = "Paste a key first.";
    statusEl.style.color = "#991b1b";
    return;
  }
  await chrome.storage.local.set({ xaiKey: v });
  statusEl.textContent = "Saved!";
  statusEl.style.color = "#166534";
  setTimeout(() => { statusEl.textContent = ""; }, 2000);
});
