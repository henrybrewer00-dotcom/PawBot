// Pawbot Browser bridge: lets the Mac app dispatch tasks to the Chrome
// extension. Mac app POSTs a task here, extension long-polls for the
// next pending task, runs it, POSTs the result back.

const pending = []; // [{ id, task, createdAt }]
const results = new Map(); // id -> { status, result, completedAt, task, createdAt }
const pollers = []; // express response objects waiting for the next task

const MAX_POLL_MS = 25_000;
const RESULT_TTL_MS = 10 * 60 * 1000;

function purgeStaleResults() {
  const cutoff = Date.now() - RESULT_TTL_MS;
  for (const [id, entry] of results) {
    const t = Date.parse(entry.completedAt ?? entry.createdAt ?? "") || 0;
    if (t && t < cutoff) results.delete(id);
  }
}

export function enqueueTask(task) {
  purgeStaleResults();
  const id = `tsk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const entry = { id, task, createdAt: new Date().toISOString() };
  results.set(id, { status: "pending", task: entry.task, createdAt: entry.createdAt });

  const poller = pollers.shift();
  if (poller) {
    try {
      poller._cleanup?.();
      poller.json(entry);
    } catch {
      pending.push(entry);
    }
  } else {
    pending.push(entry);
  }
  return id;
}

export function claimNextTask(res) {
  if (pending.length > 0) {
    res.json(pending.shift());
    return;
  }
  let cleanupCalled = false;
  const cleanup = () => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    const idx = pollers.indexOf(res);
    if (idx >= 0) pollers.splice(idx, 1);
    clearTimeout(timeout);
  };
  res._cleanup = cleanup;

  const timeout = setTimeout(() => {
    cleanup();
    if (!res.headersSent) res.json({ id: null });
  }, MAX_POLL_MS);

  res.on("close", cleanup);
  pollers.push(res);
}

export function recordResult(id, result) {
  const entry = results.get(id) ?? {};
  results.set(id, {
    ...entry,
    status: "done",
    result,
    completedAt: new Date().toISOString()
  });
}

export function getResult(id) {
  return results.get(id) ?? { status: "unknown" };
}

export async function waitForResult(id, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const entry = results.get(id);
    if (entry?.status === "done") return entry;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { status: "timeout", id };
}
