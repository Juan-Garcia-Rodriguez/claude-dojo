#!/usr/bin/env node
// Mini serveur MCP local (stdio) : expose l'outil "dojo_state" au dojo ouvert dans l'appli Claude desktop.
const readline = require("readline");
const { buildState } = require("./state.js");
const send = o => process.stdout.write(JSON.stringify(o) + "\n");
const TOOL = {
  name: "dojo_state",
  title: "État du dojo",
  description: "Liste les sessions Claude Code en cours sur ce Mac (projet, statut, modèle, sous-agents) pour l'afficher dans le dojo.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
};
readline.createInterface({ input: process.stdin }).on("line", line => {
  let m; try { m = JSON.parse(line) } catch (_) { return }
  if (m.id === undefined || m.id === null) return;
  const ok = result => send({ jsonrpc: "2.0", id: m.id, result });
  const err = (code, message) => send({ jsonrpc: "2.0", id: m.id, error: { code, message } });
  switch (m.method) {
    case "initialize":
      return ok({ protocolVersion: (m.params && m.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "claude-dojo", version: "1.0.0" } });
    case "ping": return ok({});
    case "tools/list": return ok({ tools: [TOOL] });
    case "resources/list": return ok({ resources: [] });
    case "prompts/list": return ok({ prompts: [] });
    case "tools/call":
      if (!m.params || m.params.name !== "dojo_state") return err(-32602, "Outil inconnu");
      try { const st = buildState(); return ok({ content: [{ type: "text", text: JSON.stringify(st) }], structuredContent: st }) }
      catch (e) { return ok({ content: [{ type: "text", text: "Lecture impossible : " + e.message }], isError: true }) }
    default: return err(-32601, "Méthode inconnue : " + m.method);
  }
});
