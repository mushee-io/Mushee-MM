import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import handler from "./api/index.js";

const indexFile = fileURLToPath(new URL("./public/index.html", import.meta.url));
const port = Number(process.env.PORT || 3000);

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) return await handler(req, res);
    if (req.method !== "GET" || (pathname !== "/" && pathname !== "/index.html")) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const html = await readFile(indexFile);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"
    });
    res.end(html);
  } catch {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal server error");
  }
});
server.listen(port, () => console.log("Mushee Market Data Network at http://localhost:" + port));
