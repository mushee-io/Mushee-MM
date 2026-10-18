import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import handler from "./api/index.js";

const indexFile = fileURLToPath(new URL("./public/index.html", import.meta.url));
const explorerFile = fileURLToPath(new URL("./public/explore.html", import.meta.url));
const explorerScript = fileURLToPath(new URL("./public/explore.js", import.meta.url));
const port = Number(process.env.PORT || 3000);

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) return await handler(req, res);
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      return res.end("Method not allowed");
    }
    const file = pathname === "/" || pathname === "/index.html" ? indexFile :
      pathname === "/explore" || pathname === "/explore.html" ? explorerFile :
      pathname === "/explore.js" ? explorerScript : null;
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type": file === explorerScript ? "text/javascript; charset=utf-8" :
        "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(content);
  } catch {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal server error");
  }
});
server.listen(port, () => console.log("Mushee Market Data Network at http://localhost:" + port));
