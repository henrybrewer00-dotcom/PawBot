import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { ensureAgentSandbox, getOrStartProcess, uploadScript } from "./tensorlake.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.resolve(__dirname, "../agents");

const AGENTS = [
  {
    name: "pawbot-medication-agent",
    file: "medication-agent.mjs"
  },
  {
    name: "pawbot-calendar-agent",
    file: "calendar-agent.mjs"
  },
  {
    name: "pawbot-daily-summary-agent",
    file: "daily-summary-agent.mjs"
  }
];

function agentEnv() {
  return {
    PUBLIC_BASE_URL: config.publicBaseUrl,
    AGENT_AUTH_TOKEN: config.agentAuthToken,
    AGENT_POLL_SECONDS: String(config.agent.pollSeconds),
    AGENT_TIMEZONE: "America/Los_Angeles"
  };
}

export async function startTensorlakeAgents() {
  if (!config.tensorlake.apiKey) return [];

  const launched = [];
  for (const agent of AGENTS) {
    const sandbox = await ensureAgentSandbox(agent.name);
    const scriptPath = await uploadScript(
      sandbox,
      path.join(agentsDir, agent.file),
      `/tmp/${agent.file}`
    );
    const processInfo = await getOrStartProcess(sandbox, scriptPath, agentEnv());
    if (sandbox && scriptPath && processInfo) launched.push(agent.name);
  }

  if (launched.length > 0) {
    console.log(`Tensorlake agents launched: ${launched.join(", ")}`);
  }
  return launched;
}
