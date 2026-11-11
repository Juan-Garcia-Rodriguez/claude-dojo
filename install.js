#!/usr/bin/env node
// Installe (ou désinstalle avec --desinstaller) le pont entre Claude Code et le dojo.
const fs = require("fs"), path = require("path"), os = require("os"), { execSync } = require("child_process");
const HOME = os.homedir(), DIR = path.join(HOME, ".claude-dojo");
const SETTINGS = path.join(HOME, ".claude", "settings.json");
const DESKTOP = path.join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json");
const NODE = process.execPath, HOOK = path.join(DIR, "hook.js"), SERVER = path.join(DIR, "server.js");
const uninstall = process.argv.includes("--desinstaller");
const FILES = ["hook.js", "server.js", "state.js", "web.js", "dojo.html", "DojoMenu.swift"];
const LABEL = "com.claude-dojo.web";
const APP = path.join(HOME, "Applications", "Dojo Claude Code.app");
const APP_BIN = path.join(APP, "Contents", "MacOS", "DojoMenu");
const PLIST = path.join(HOME, "Library", "LaunchAgents", LABEL + ".plist");
const run = cmd => { try { execSync(cmd, { stdio: "ignore" }); return true } catch (_) { return false } };
const EVENTS = ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd", "SubagentStart", "SubagentStop", "PreToolUse"];

function readJSON(f) {
  if (!fs.existsSync(f)) return {};
  const txt = fs.readFileSync(f, "utf8").trim();
  if (!txt) return {};
  try { return JSON.parse(txt) } catch (e) { console.error("✗ " + f + " n'est pas un JSON valide, je n'y touche pas. Corrige-le puis relance."); process.exit(1) }
}
function writeJSON(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (fs.existsSync(f)) fs.copyFileSync(f, f + ".avant-dojo.bak");
  fs.writeFileSync(f, JSON.stringify(obj, null, 2) + "\n");
}
const isOurs = h => typeof h?.command === "string" && h.command.includes(".claude-dojo/hook.js");

// 1. Hooks Claude Code
const settings = readJSON(SETTINGS);
settings.hooks = settings.hooks || {};
for (const ev of EVENTS) {
  const groups = (settings.hooks[ev] || [])
    .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !isOurs(h)) }))
    .filter(g => g.hooks.length);
  if (!uninstall) {
    const group = { hooks: [{ type: "command", command: `"${NODE}" "${HOOK}"`, timeout: 5 }] };
    if (ev === "PreToolUse") group.matcher = "Task|Agent";
    groups.push(group);
  }
  if (groups.length) settings.hooks[ev] = groups; else delete settings.hooks[ev];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;
writeJSON(SETTINGS, settings);

// 2. Serveur MCP local pour l'appli Claude desktop
const desk = readJSON(DESKTOP);
desk.mcpServers = desk.mcpServers || {};
if (uninstall) delete desk.mcpServers["claude-dojo"];
else desk.mcpServers["claude-dojo"] = { command: NODE, args: [SERVER] };
writeJSON(DESKTOP, desk);

// 3. Fichiers + serveur web permanent (launchd)
const isMac = process.platform === "darwin";
const uid = isMac ? execSync("id -u").toString().trim() : "";
if (isMac) { run(`launchctl bootout gui/${uid}/${LABEL}`); run("sleep 1") }
if (uninstall) {
  if (fs.existsSync(PLIST)) fs.unlinkSync(PLIST);
  if (isMac) run(`pkill -x DojoMenu`);
  if (fs.existsSync(APP)) fs.rmSync(APP, { recursive: true, force: true });
  for (const f of FILES) { const p = path.join(DIR, f); if (fs.existsSync(p)) fs.unlinkSync(p) }
  console.log("✓ Pont et serveur web retirés. Le journal reste dans " + DIR + " (supprime le dossier si tu veux).");
} else {
  fs.mkdirSync(DIR, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(__dirname, f), path.join(DIR, f));
  console.log("✓ Hooks ajoutés dans " + SETTINGS);
  console.log("✓ Serveur « claude-dojo » ajouté dans la config de l'appli Claude desktop");
  console.log("✓ Fichiers copiés dans " + DIR);
  if (isMac) {
    fs.writeFileSync(path.join(DIR, "node-path"), NODE + "\n");
    // Icône dans la barre des menus : petite appli Swift compilée sur ton Mac
    run(`pkill -x DojoMenu`);
    let menuOK = false;
    if (run("xcrun --find swiftc")) {
      fs.rmSync(APP, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(APP_BIN), { recursive: true });
      fs.writeFileSync(path.join(APP, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Dojo Claude Code</string>
  <key>CFBundleIdentifier</key><string>com.claude-dojo.menu</string>
  <key>CFBundleExecutable</key><string>DojoMenu</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict></plist>
`);
      try {
        execSync(`xcrun swiftc -O "${path.join(__dirname, "DojoMenu.swift")}" -o "${APP_BIN}" -swift-version 5 -framework AppKit`, { stdio: "pipe" });
        run(`codesign --force -s - "${APP}"`);
        menuOK = true;
        console.log("✓ Icône compilée : " + APP);
      } catch (e) {
        console.log("✗ La compilation de l'icône a échoué :\n" + String(e.stderr || e.message).slice(0, 1500));
      }
    } else {
      console.log("✗ Pas d'outils de compilation Swift : lance « xcode-select --install », puis relance « node install.js » pour avoir l'icône.");
    }
    const prog = menuOK
      ? `<string>${APP_BIN}</string>`
      : `<string>${NODE}</string><string>${path.join(DIR, "web.js")}</string>`;
    const keep = menuOK
      ? `<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>`
      : `<key>KeepAlive</key><true/>`;
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>${prog}</array>
  <key>RunAtLoad</key><true/>
  ${keep}
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${path.join(DIR, "menu.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(DIR, "menu.log")}</string>
</dict></plist>
`;
    fs.mkdirSync(path.dirname(PLIST), { recursive: true });
    fs.writeFileSync(PLIST, plist);
    const ok = run(`launchctl bootstrap gui/${uid} "${PLIST}"`) || run(`launchctl load -w "${PLIST}"`);
    if (ok) {
      console.log(menuOK ? "✓ Icône du dojo ajoutée dans la barre des menus (elle se lance avec ton Mac)" : "✓ Dojo lancé sur http://localhost:4747 (sans icône)");
      setTimeout(() => run("open http://localhost:4747"), 1500);
    } else console.log("✗ Impossible de lancer le dojo, regarde " + path.join(DIR, "menu.log"));
  }
  console.log("\nRelance tes sessions Claude Code si ce n'est pas déjà fait.");
}
