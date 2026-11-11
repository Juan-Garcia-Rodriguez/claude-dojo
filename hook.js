#!/usr/bin/env node
// Hook Claude Code -> écrit chaque événement utile dans ~/.claude-dojo/events.jsonl
// Ne bloque jamais Claude Code : n'écrit rien sur la sortie et sort toujours avec le code 0.
const fs = require("fs"), path = require("path"), os = require("os");
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  try {
    const e = JSON.parse(raw);
    const ev = e.hook_event_name;
    const out = { ts: Date.now(), ev, sid: e.session_id, cwd: e.cwd };
    if (e.agent_id) out.aid = e.agent_id;
    if (e.agent_type) out.atype = e.agent_type;
    if (e.model) out.model = typeof e.model === "string" ? e.model : (e.model.id || e.model.display_name || "");
    if (e.source) out.src = e.source;
    if (e.reason) out.reason = e.reason;
    if (ev === "UserPromptSubmit" && process.env.DOJO_NO_PROMPTS !== "1") out.prompt = String(e.prompt || "").slice(0, 240);
    if (ev === "PreToolUse") {
      if (!/^(Task|Agent)$/.test(e.tool_name || "")) process.exit(0);
      const ti = e.tool_input || {};
      out.task = String(ti.description || "").slice(0, 160);
      if (ti.subagent_type) out.stype = String(ti.subagent_type);
    }
    const dir = path.join(os.homedir(), ".claude-dojo");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "events.jsonl"), JSON.stringify(out) + "\n");
  } catch (_) {}
  process.exit(0);
});
