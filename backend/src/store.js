import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const dataPath = path.join(dataDir, "pawbot.json");

const emptyState = () => ({
  users: [],
  careRelationships: [],
  medications: [],
  medicationLogs: [],
  calendarEvents: [],
  scamAlerts: [],
  agentLogs: [],
  hyperspellConnections: []
});

export class JsonStore {
  constructor(filePath = dataPath) {
    this.filePath = filePath;
    this.state = emptyState();
    this.load();
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.persist();
      return;
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    this.state = { ...emptyState(), ...JSON.parse(raw) };
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  all(collection) {
    return this.state[collection] ?? [];
  }

  find(collection, predicate) {
    return this.all(collection).find(predicate);
  }

  insert(collection, item) {
    this.state[collection].push(item);
    this.persist();
    return item;
  }

  update(collection, id, changes) {
    const items = this.all(collection);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return null;

    items[index] = { ...items[index], ...changes };
    this.persist();
    return items[index];
  }
}

export const store = new JsonStore();
