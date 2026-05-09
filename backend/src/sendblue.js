import { config } from "./config.js";

export function canSendRealTexts() {
  return Boolean(
    config.sendblue.apiKey &&
      config.sendblue.apiSecret &&
      config.sendblue.fromNumber
  );
}

export async function sendText({ to, content, statusCallback }) {
  if (!canSendRealTexts()) {
    return {
      provider: "demo",
      status: "SKIPPED",
      number: to,
      content,
      reason: "Sendblue credentials are not configured"
    };
  }

  const response = await fetch("https://api.sendblue.co/api/send-message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "sb-api-key-id": config.sendblue.apiKey,
      "sb-api-secret-key": config.sendblue.apiSecret
    },
    body: JSON.stringify({
      content,
      from_number: config.sendblue.fromNumber,
      number: to,
      status_callback: statusCallback
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_message ?? `Sendblue failed with ${response.status}`);
  }

  return {
    provider: "sendblue",
    ...payload
  };
}
