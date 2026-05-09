const baseUrl = process.env.PUBLIC_BASE_URL;
const token = process.env.AGENT_AUTH_TOKEN;
const pollSeconds = Number(process.env.AGENT_POLL_SECONDS ?? "30");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callMedicationTick() {
  const response = await fetch(`${baseUrl}/api/agents/medication-tick`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`[medication-agent] tick error ${response.status}: ${body}`);
  } else {
    console.log(`[medication-agent] ${response.status} ${body}`);
  }
}

if (!baseUrl || !token) {
  throw new Error("PUBLIC_BASE_URL and AGENT_AUTH_TOKEN are required");
}

while (true) {
  try {
    await callMedicationTick();
  } catch (error) {
    console.error("[medication-agent] tick failed", error);
  }
  await sleep(Math.max(1, pollSeconds) * 1000);
}
