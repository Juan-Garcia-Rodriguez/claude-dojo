// Lecture du journal et calcul de l’état des sessions (partagé par le serveur MCP et le serveur web)
const fs = require("fs"), path = require("path"), os = require("os");
const FILE = path.join(os.homedir(), ".claude-dojo", "events.jsonl");
const MAX_BYTES = 3 * 1024 * 1024, KEEP_LINES = 4000;
const ENDED_GRACE = 20000, DONE_GRACE = 20000, STALE = 6 * 3600 * 1000, SUB_STALE = 2 * 3600 * 1000;

function readEvents() {
  if (!fs.existsSync(FILE)) return [];
  let text = fs.readFileSync(FILE, "utf8");
  let lines = text.split("\n").filter(Boolean);
  if (Buffer.byteLength(text) > MAX_BYTES) {
    lines = lines.slice(-KEEP_LINES);
    try { fs.writeFileSync(FILE, lines.join("\n") + "\n") } catch (_) {}
  }
  const evs = [];
  for (const l of lines) { try { evs.push(JSON.parse(l)) } catch (_) {} }
  return evs;
}

function buildState() {
  const now = Date.now(), sessions = {};
  for (const e of readEvents()) {
    if (!e.sid) continue;
    const s = sessions[e.sid] || (sessions[e.sid] = {
      id: e.sid, cwd: e.cwd || "", project: path.basename(e.cwd || "") || "projet",
      status: "idle", startedAt: e.ts, lastAt: e.ts, model: "", agentType: "",
      prompt: "", spawned: false, subs: {}, pending: [], endedAt: 0,
    });
    s.lastAt = e.ts;
    if (e.cwd && !e.aid && e.ev !== "SubagentStart" && e.ev !== "SubagentStop") { s.cwd = e.cwd; s.project = path.basename(e.cwd) || s.project }
    switch (e.ev) {
      case "SessionStart":
        if (s.status === "ended") { s.status = "idle"; s.endedAt = 0 }
        if (e.model) s.model = e.model;
        if (e.atype && !e.aid) s.agentType = e.atype;
        break;
      case "UserPromptSubmit":
        s.status = "working"; if (e.prompt) s.prompt = e.prompt; break;
      case "PreToolUse":
        if (!e.aid) s.pending.push(e.task || e.stype || ""); break;
      case "SubagentStart":
        s.spawned = true; s.status = s.status === "ended" ? "ended" : "working";
        s.subs[e.aid] = { id: e.aid, type: e.atype || "agent", status: "working", startedAt: e.ts, endedAt: 0, task: s.pending.shift() || "" };
        break;
      case "SubagentStop": {
        const sub = s.subs[e.aid] || (s.subs[e.aid] = { id: e.aid, type: e.atype || "agent", startedAt: e.ts, task: "" });
        sub.status = "done"; sub.endedAt = e.ts; s.spawned = true; break;
      }
      case "Stop":
        if (!e.aid && s.status !== "ended") s.status = "idle"; break;
      case "SessionEnd":
        s.status = "ended"; s.endedAt = e.ts;
        for (const sub of Object.values(s.subs)) if (sub.status === "working") { sub.status = "done"; sub.endedAt = e.ts }
        break;
    }
  }
  const list = Object.values(sessions)
    .filter(s => (s.status !== "ended" || now - s.endedAt < ENDED_GRACE) && now - s.lastAt < STALE)
    .map(s => ({
      id: s.id, project: s.project, cwd: s.cwd, status: s.status, model: s.model, agentType: s.agentType,
      prompt: s.prompt, role: s.spawned ? "chef" : "solo", startedAt: s.startedAt, lastAt: s.lastAt,
      subagents: Object.values(s.subs)
        .filter(x => (x.status === "working" && now - x.startedAt < SUB_STALE) || (x.status === "done" && now - x.endedAt < DONE_GRACE))
        .map(x => ({ id: x.id, type: x.type, status: x.status, task: x.task, startedAt: x.startedAt })),
    }))
    .sort((a, b) => a.startedAt - b.startedAt);
  return { now, sessions: list };
}

module.exports = { buildState };
