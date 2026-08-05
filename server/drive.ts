/**
 * Uploading claim documents to Google Drive.
 *
 * A service account has no storage quota of its own, so it cannot own a file.
 * Google offers exactly two ways round that, and one of them has to be set up
 * before uploads work:
 *
 *   1. Put the folder in a **Shared Drive** and give the service account
 *      Content Manager on it. Storage is billed to the organisation, so the
 *      service account never needs quota. Nothing else to configure.
 *
 *   2. Turn on **domain-wide delegation** for the service account and set
 *      GOOGLE_IMPERSONATE_SUBJECT to a real user in the domain. Files are then
 *      created as that person and counted against their quota, which is what
 *      makes an ordinary My Drive folder work.
 *
 * Without either, Drive answers "Service Accounts do not have storage quota"
 * — which `uploadFile` turns into a message saying exactly that.
 */

import { google, type drive_v3 } from "googleapis";
import { Readable } from "stream";

export const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || "";

/** Requests bigger than this are refused; Vercel caps a request body at ~4.5 MB. */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 4) * 1024 * 1024;

let client: drive_v3.Drive | null = null;

function driveClient(): drive_v3.Drive {
  if (client) return client;
  const subject = process.env.GOOGLE_IMPERSONATE_SUBJECT || undefined;
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"],
    // Only set when domain-wide delegation is configured; otherwise the
    // service account acts as itself and needs a Shared Drive.
    subject,
  });
  client = google.drive({ version: "v3", auth });
  return client;
}

export class DriveError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/**
 * Builds the stored file name: employee id, person, date — plus an index when
 * one submission carries several files, so they stay distinguishable.
 */
export function documentFileName(
  employeeId: string,
  employeeName: string,
  originalName: string,
  index = 0,
  when = new Date(),
): string {
  const clean = (v: string) => String(v || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot).toLowerCase() : "";
  const date = when.toISOString().slice(0, 10);
  const suffix = index > 0 ? `-${index + 1}` : "";
  return `${clean(employeeId)}-${clean(employeeName)}-${date}${suffix}${ext}`;
}

export interface UploadedFile {
  id: string;
  name: string;
  link: string;
  sizeBytes: number;
}

/** Puts one file in the configured folder and returns a shareable link. */
export async function uploadFile(
  name: string,
  mimeType: string,
  body: Buffer,
): Promise<UploadedFile> {
  if (!DRIVE_FOLDER_ID) {
    throw new DriveError("File uploads are not configured — set DRIVE_FOLDER_ID.", 503);
  }
  if (!body.length) throw new DriveError("The file is empty.", 400);
  if (body.length > MAX_UPLOAD_BYTES) {
    throw new DriveError(`That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`, 413);
  }

  try {
    const res = await driveClient().files.create({
      requestBody: { name, parents: [DRIVE_FOLDER_ID] },
      media: { mimeType: mimeType || "application/octet-stream", body: Readable.from(body) },
      fields: "id,name,webViewLink,size",
      supportsAllDrives: true,
    });
    const id = res.data.id!;
    return {
      id,
      name: res.data.name || name,
      // webViewLink is present for files the caller can see; fall back to the
      // canonical view URL so a link always comes back.
      link: res.data.webViewLink || `https://drive.google.com/file/d/${id}/view`,
      sizeBytes: Number(res.data.size) || body.length,
    };
  } catch (err) {
    const message = (err as Error).message || "";
    if (/storage quota/i.test(message)) {
      throw new DriveError(
        "Drive rejected the upload: a service account has no storage of its own. Move the folder into a Shared Drive and give the service account Content Manager, or switch on domain-wide delegation and set GOOGLE_IMPERSONATE_SUBJECT.",
        503,
      );
    }
    if (/File not found|notFound/i.test(message)) {
      throw new DriveError("The Drive folder was not found, or is not shared with the service account.", 503);
    }
    throw new DriveError(`Drive refused the upload: ${message}`, 502);
  }
}
