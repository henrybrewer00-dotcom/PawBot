import { fetchGmailRecent, isComposioConfigured } from "./composio.js";
import { grokChat } from "./grok.js";

const seenEmailIds = new Set();
const scamAlerts = [];
const MAX_ALERTS = 100;
const SCAN_INTERVAL_MS = 5 * 60 * 1000;
const HIGH_CONFIDENCE_SCAM_RULES = [
  { pattern: /\bfree\s+cash\b/i, reason: "The email promises free cash, which is a common scam hook." },
  { pattern: /\bfree\s+money\b/i, reason: "The email promises free money, which is a common scam hook." },
  { pattern: /\bcash\s+prize\b/i, reason: "The email mentions a cash prize, which is often used in scam messages." },
  { pattern: /\byou\s+(have\s+)?won\b/i, reason: "The email says the recipient won something unexpectedly." },
  { pattern: /\bclaim\s+(your\s+)?(cash|prize|reward|money)\b/i, reason: "The email asks the recipient to claim money or a prize." },
  { pattern: /\bgift\s+card\b/i, reason: "The email mentions gift cards, which are often used in scams." },
  { pattern: /\bwire\s+transfer\b/i, reason: "The email asks about a wire transfer, which can be risky." },
  { pattern: /\bverify\s+your\s+account\b/i, reason: "The email asks for account verification, which can be phishing." },
  { pattern: /\bunusual\s+login\b/i, reason: "The email mentions an unusual login and may be phishing." },
  { pattern: /\bpassword\b/i, reason: "The email mentions a password and may be trying to steal credentials." }
];

let scannerStarted = false;
let lastScanAt = null;
let lastScanError = null;

export function listScamAlerts({ activeOnly = true } = {}) {
  return scamAlerts
    .filter((a) => (activeOnly ? !a.dismissed : true))
    .slice()
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export function dismissScamAlert(id) {
  const alert = scamAlerts.find((a) => a.id === id);
  if (alert) alert.dismissed = true;
  return Boolean(alert);
}

export function scannerStatus() {
  return { started: scannerStarted, lastScanAt, lastScanError, alertsTracked: scamAlerts.length };
}

function emailText(message) {
  return [
    message.from,
    message.subject,
    message.snippet
  ].filter(Boolean).join("\n");
}

export function deterministicEmailScamScore(message) {
  const text = emailText(message);
  const match = HIGH_CONFIDENCE_SCAM_RULES.find((rule) => rule.pattern.test(text));
  if (!match) return null;
  return {
    verdict: "SCAM",
    reason: match.reason
  };
}

export async function scoreEmailForScam(message, { allowLlm = true } = {}) {
  const deterministic = deterministicEmailScamScore(message);
  if (deterministic) return deterministic;

  if (!allowLlm || !process.env.XAI_API_KEY) {
    return {
      verdict: "SAFE",
      reason: "No high-confidence scam phrase was found."
    };
  }

  const prompt = [
    "You are a scam-detection helper for older adults. Decide if the email below is suspicious (phishing, fraud, scam, gift card scam, fake support, urgency manipulation, romance scam, prize/lottery, malicious attachment, impersonation).",
    "Reply with EXACTLY one line in this shape:",
    "VERDICT: SCAM|SUSPICIOUS|SAFE",
    "REASON: <one short sentence in plain language a senior would understand>",
    "",
    `From: ${message.from}`,
    `Subject: ${message.subject}`,
    `Preview: ${(message.snippet || "").slice(0, 800)}`
  ].join("\n");

  const reply = await grokChat([
    { role: "system", content: "You triage emails for scam risk. Be conservative — only flag SCAM when clearly malicious. SUSPICIOUS for urgent/odd-but-not-clearly-malicious. SAFE for ordinary mail." },
    { role: "user", content: prompt }
  ], { temperature: 0.2, maxTokens: 160 });

  const verdictMatch = reply.match(/VERDICT:\s*(SCAM|SUSPICIOUS|SAFE)/i);
  const reasonMatch = reply.match(/REASON:\s*(.+)/i);
  return {
    verdict: (verdictMatch?.[1] ?? "SAFE").toUpperCase(),
    reason: (reasonMatch?.[1] ?? "").trim()
  };
}

async function runScanOnce() {
  if (!isComposioConfigured()) {
    lastScanError = "composio_not_configured";
    return;
  }
  try {
    const messages = await fetchGmailRecent(10);
    for (const m of messages) {
      if (!m.id || seenEmailIds.has(m.id)) continue;
      seenEmailIds.add(m.id);
      try {
        const { verdict, reason } = await scoreEmailForScam(m);
        if (verdict === "SCAM" || verdict === "SUSPICIOUS") {
          scamAlerts.push({
            id: m.id,
            verdict,
            reason,
            from: m.from,
            subject: m.subject,
            snippet: m.snippet,
            detectedAt: new Date().toISOString(),
            dismissed: false
          });
          if (scamAlerts.length > MAX_ALERTS) scamAlerts.shift();
        }
      } catch (innerErr) {
        console.error("[scamScanner] scoring failed:", innerErr.message);
      }
    }
    lastScanAt = new Date().toISOString();
    lastScanError = null;
  } catch (err) {
    lastScanError = err.message;
    console.error("[scamScanner] scan error:", err.message);
  }
}

export function startScamScanner() {
  if (scannerStarted) return;
  scannerStarted = true;
  setTimeout(runScanOnce, 4000);
  setInterval(runScanOnce, SCAN_INTERVAL_MS);
}
