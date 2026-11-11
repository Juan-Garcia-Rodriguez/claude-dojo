#!/usr/bin/env node
// Serveur web local du dojo : http://localhost:4747 (tourne en continu grâce à launchd)
const http = require("http"), fs = require("fs"), path = require("path");
const { buildState } = require("./state.js");
const PORT = Number(process.env.DOJO_PORT || 4747);
const HOST = process.env.DOJO_HOST || "127.0.0.1";
const PAGE = path.join(__dirname, "dojo.html");
http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  try {
    if (url === "/state") {
      const body = JSON.stringify(buildState());
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(body);
    }
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(PAGE));
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Introuvable");
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Erreur : " + e.message);
  }
}).on("error", e => { console.error("Serveur du dojo : " + e.message); process.exit(1) })
  .listen(PORT, HOST, () => console.log(`Dojo sur http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`));
