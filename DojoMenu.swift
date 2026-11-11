// Icône du dojo dans la barre des menus macOS.
// Elle lance le serveur web du dojo, l'arrête, et affiche le nombre d'agents au travail.
import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    lazy var statusItem: NSStatusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let menu = NSMenu()
    let infoItem = NSMenuItem(title: "Démarrage…", action: nil, keyEquivalent: "")
    let toggleItem = NSMenuItem(title: "Arrêter le dojo", action: nil, keyEquivalent: "")
    let dir = (NSHomeDirectory() as NSString).appendingPathComponent(".claude-dojo")
    let dojoURL = URL(string: "http://localhost:4747")!
    var server: Process?
    var timer: Timer?
    var baseTitle = ""

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Une seule icône à la fois
        if let id = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: id).count > 1 {
            NSApp.terminate(nil); return
        }
        if let button = statusItem.button {
            if let img = NSImage(systemSymbolName: "figure.martial.arts", accessibilityDescription: "Dojo Claude Code") {
                img.isTemplate = true
                button.image = img
                button.imagePosition = .imageLeading
            } else {
                baseTitle = "⛩"
                button.title = baseTitle
            }
            button.toolTip = "Dojo Claude Code"
        }
        infoItem.isEnabled = false
        menu.addItem(infoItem)
        menu.addItem(NSMenuItem.separator())

        let openItem = NSMenuItem(title: "Ouvrir le dojo", action: #selector(openDojo), keyEquivalent: "o")
        openItem.target = self
        menu.addItem(openItem)

        toggleItem.action = #selector(toggleServer)
        toggleItem.target = self
        menu.addItem(toggleItem)

        menu.addItem(NSMenuItem.separator())
        let quitItem = NSMenuItem(title: "Quitter le dojo", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)
        statusItem.menu = menu

        startServer()
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.refresh() }
        refresh()
    }

    func nodePath() -> String {
        let file = (dir as NSString).appendingPathComponent("node-path")
        if let s = try? String(contentsOfFile: file, encoding: .utf8) {
            let p = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if !p.isEmpty { return p }
        }
        for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] where FileManager.default.fileExists(atPath: p) { return p }
        return "/usr/local/bin/node"
    }

    func startServer() {
        guard server == nil else { return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: nodePath())
        p.arguments = [(dir as NSString).appendingPathComponent("web.js")]
        let logPath = (dir as NSString).appendingPathComponent("web.log")
        if !FileManager.default.fileExists(atPath: logPath) {
            FileManager.default.createFile(atPath: logPath, contents: nil)
        }
        if let handle = FileHandle(forWritingAtPath: logPath) {
            handle.seekToEndOfFile()
            p.standardOutput = handle
            p.standardError = handle
        }
        p.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                guard let self = self, self.server === proc else { return }
                self.server = nil
                self.updateToggle()
                self.refresh()
            }
        }
        do {
            try p.run()
            server = p
        } catch {
            infoItem.title = "Impossible de lancer le serveur"
        }
        updateToggle()
    }

    func stopServer() {
        let p = server
        server = nil
        p?.terminate()
        updateToggle()
        refresh()
    }

    func updateToggle() {
        toggleItem.title = server == nil ? "Démarrer le dojo" : "Arrêter le dojo"
    }

    @objc func toggleServer() {
        if server == nil { startServer() } else { stopServer() }
        refresh()
    }

    @objc func openDojo() {
        if server == nil {
            startServer()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { NSWorkspace.shared.open(self.dojoURL) }
        } else {
            NSWorkspace.shared.open(dojoURL)
        }
    }

    @objc func quitApp() {
        stopServer()
        NSApp.terminate(nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        server?.terminate()
    }

    func setBadge(_ working: Int) {
        statusItem.button?.title = baseTitle + (working > 0 ? " \(working)" : "")
    }

    func refresh() {
        guard server != nil else {
            infoItem.title = "Dojo arrêté"
            statusItem.button?.appearsDisabled = true
            setBadge(0)
            return
        }
        statusItem.button?.appearsDisabled = false
        let url = dojoURL.appendingPathComponent("state")
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            var text = "Démarrage du serveur…"
            var working = 0
            if let data = data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let sessions = json["sessions"] as? [[String: Any]] {
                var agents = 0
                for s in sessions where (s["status"] as? String) != "ended" {
                    agents += 1
                    if (s["status"] as? String) == "working" { working += 1 }
                    let subs = (s["subagents"] as? [[String: Any]]) ?? []
                    for sub in subs where (sub["status"] as? String) == "working" {
                        agents += 1
                        working += 1
                    }
                }
                text = agents == 0 ? "Aucun agent au dojo"
                    : "\(agents) agent\(agents > 1 ? "s" : ""), \(working) au travail"
            }
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.infoItem.title = text
                self.setBadge(working)
            }
        }.resume()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
