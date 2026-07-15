const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const BACKUP_FILENAME = "liber-wallet-backup.json";
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken: () => void };
        };
      };
    };
  }
}

export class GoogleSignInCancelledError extends Error {
  constructor() {
    super("Google sign-in was cancelled.");
    this.name = "GoogleSignInCancelledError";
  }
}

export interface DriveFileRef {
  fileId: string;
}

let gisLoadPromise: Promise<void> | null = null;

export function loadGoogleIdentityServices(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

export async function requestAccessToken(clientId: string): Promise<string> {
  await loadGoogleIdentityServices();
  if (!window.google) throw new Error("Google Identity Services did not load");

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new GoogleSignInCancelledError());
      },
    });
    client.requestAccessToken();
  });
}

export async function findBackupFile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<DriveFileRef | null> {
  const url = `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=name%3D%27${BACKUP_FILENAME}%27&fields=files(id,name)`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const body = (await res.json()) as { files: { id: string; name: string }[] };
  return body.files[0] ? { fileId: body.files[0].id } : null;
}

export async function readBackupFile<T>(
  fileId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const res = await fetchImpl(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function createBackupFile<T>(
  payload: T,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<DriveFileRef> {
  const boundary = "liber_backup_boundary";
  const metadata = JSON.stringify({ name: BACKUP_FILENAME, parents: ["appDataFolder"] });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n` +
    `--${boundary}--`;

  const res = await fetchImpl(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const result = (await res.json()) as { id: string };
  return { fileId: result.id };
}

export async function updateBackupFile<T>(
  fileId: string,
  payload: T,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<DriveFileRef> {
  const res = await fetchImpl(`${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return { fileId };
}
