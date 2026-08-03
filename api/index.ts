/**
 * Vercel serverless entrypoint. An Express app is a valid Node request
 * handler, so exporting it is all Vercel needs.
 *
 * Every /api/* path is rewritten here by vercel.json; the built client in
 * dist/ is served as static files.
 */

import "dotenv/config";
import app from "../server/app.js";

export default app;
