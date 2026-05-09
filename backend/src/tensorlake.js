import fs from "node:fs/promises";
import { Sandbox } from "tensorlake";
import { config } from "./config.js";

function tensorlakeOptions() {
  return { apiKey: config.tensorlake.apiKey };
}

function isRunning(processInfo) {
  return String(processInfo?.status ?? "").toLowerCase() === "running";
}

export async function ensureAgentSandbox(name) {
  if (!config.tensorlake.apiKey) return null;

  try {
    const sandboxes = await Sandbox.list(tensorlakeOptions());
    const existing = sandboxes.find((sandbox) => sandbox.name === name);
    const sandboxId = existing?.sandboxId ?? existing?.id;

    if (sandboxId) {
      const sandbox = await Sandbox.connect({ sandboxId, ...tensorlakeOptions() });
      const status = String(existing.status ?? "").toLowerCase();
      if (status === "suspended") await sandbox.resume();
      return sandbox;
    }

    return await Sandbox.create({
      name,
      allowInternetAccess: true,
      ...tensorlakeOptions()
    });
  } catch (error) {
    console.error(`Tensorlake sandbox setup failed for ${name}`, error);
    return null;
  }
}

export async function uploadScript(sandbox, localPath, remotePath = `/tmp/${localPath.split("/").pop()}`) {
  if (!sandbox) return null;

  try {
    await sandbox.writeFile(remotePath, await fs.readFile(localPath));
    return remotePath;
  } catch (error) {
    console.error(`Tensorlake script upload failed for ${localPath}`, error);
    return null;
  }
}

export async function startProcess(sandbox, scriptPath, env = {}) {
  if (!sandbox || !scriptPath) return null;

  try {
    return await sandbox.startProcess("node", {
      args: [scriptPath],
      env
    });
  } catch (error) {
    console.error(`Tensorlake process start failed for ${scriptPath}`, error);
    return null;
  }
}

export async function getOrStartProcess(sandbox, scriptPath, env = {}) {
  if (!sandbox || !scriptPath) return null;

  try {
    const processes = await sandbox.listProcesses();
    const existing = processes.find((processInfo) => (
      isRunning(processInfo) &&
      processInfo.command === "node" &&
      Array.isArray(processInfo.args) &&
      processInfo.args.includes(scriptPath)
    ));
    return existing ?? await startProcess(sandbox, scriptPath, env);
  } catch (error) {
    console.error(`Tensorlake process check failed for ${scriptPath}`, error);
    return null;
  }
}
