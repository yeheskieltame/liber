import { encrypt, decrypt, type EncryptedPayload } from "./crypto";
import { findBackupFile, readBackupFile, createBackupFile, updateBackupFile } from "./googleDrive";

const BACKUP_VERSION = 1;

interface StoredBackupFile extends EncryptedPayload {
  version: number;
}

export async function backupToGoogleDrive(
  accessToken: string,
  secretKey: string,
  passphrase: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const encrypted = await encrypt(secretKey, passphrase);
  const payload: StoredBackupFile = { version: BACKUP_VERSION, ...encrypted };

  const existing = await findBackupFile(accessToken, fetchImpl);
  if (existing) {
    await updateBackupFile(existing.fileId, payload, accessToken, fetchImpl);
  } else {
    await createBackupFile(payload, accessToken, fetchImpl);
  }
}

export async function checkExistingBackup(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const existing = await findBackupFile(accessToken, fetchImpl);
  return existing !== null;
}

export async function restoreFromGoogleDrive(
  accessToken: string,
  passphrase: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const existing = await findBackupFile(accessToken, fetchImpl);
  if (!existing) throw new Error("No Liber backup found in this Google account.");

  const stored = await readBackupFile<StoredBackupFile>(existing.fileId, accessToken, fetchImpl);
  if (stored.version !== BACKUP_VERSION) {
    throw new Error("This backup was made with a newer version of Liber.");
  }

  return decrypt(stored, passphrase);
}
