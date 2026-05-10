import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "..", "data", "site-accounts.json");

async function ensureStore() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify({ accounts: [] }, null, 2));
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.accounts) ? parsed : { accounts: [] };
  } catch {
    return { accounts: [] };
  }
}

async function writeStore(state) {
  await ensureStore();
  await fs.writeFile(STORE_PATH, JSON.stringify(state, null, 2));
}

function normalizeDomain(input) {
  if (!input) return "";
  const trimmed = String(input).trim().toLowerCase();
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "").split("/")[0];
  }
}

export async function listSiteAccounts() {
  const { accounts } = await readStore();
  return accounts;
}

export async function getSiteAccount(domain) {
  const target = normalizeDomain(domain);
  if (!target) return null;
  const { accounts } = await readStore();
  return accounts.find((a) => normalizeDomain(a.domain) === target) ?? null;
}

export async function recordSiteAccount({ domain, email, status, notes }) {
  const target = normalizeDomain(domain);
  if (!target) throw new Error("domain is required");
  const state = await readStore();
  const idx = state.accounts.findIndex((a) => normalizeDomain(a.domain) === target);
  const now = new Date().toISOString();
  const existing = idx >= 0 ? state.accounts[idx] : null;
  const entry = {
    domain: target,
    email: email ?? existing?.email ?? null,
    status: status ?? existing?.status ?? "active",
    notes: notes ?? existing?.notes ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  if (idx >= 0) state.accounts[idx] = entry;
  else state.accounts.push(entry);
  await writeStore(state);
  return entry;
}

export async function deleteSiteAccount(domain) {
  const target = normalizeDomain(domain);
  if (!target) return false;
  const state = await readStore();
  const before = state.accounts.length;
  state.accounts = state.accounts.filter((a) => normalizeDomain(a.domain) !== target);
  if (state.accounts.length === before) return false;
  await writeStore(state);
  return true;
}
