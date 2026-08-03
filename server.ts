/**
 * Local development / self-hosted entrypoint.
 *
 * Serves the API from server/app.ts plus the client — through Vite in
 * development, from dist/ in production — and listens on a port. Vercel does
 * not use this file; it uses api/index.ts instead.
 */

import "dotenv/config";
import path from "path";
import app from "./server/app.js";

const CLIENT_DIR = path.resolve(process.cwd(), "dist");
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

async function start() {
  const express = (await import("express")).default;

  if (isProd) {
    app.use(express.static(CLIENT_DIR));
    app.get("*", (_req, res) => res.sendFile(path.join(CLIENT_DIR, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    console.log(`TA & Per-Diem system running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
