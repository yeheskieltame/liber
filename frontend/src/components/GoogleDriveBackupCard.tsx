"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { requestAccessToken, GoogleSignInCancelledError, GoogleSignInFailedError } from "@/lib/backup/googleDrive";
import { backupToGoogleDrive, restoreFromGoogleDrive } from "@/lib/backup/driveBackup";
import { DecryptionError } from "@/lib/backup/crypto";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

type Props =
  | { mode: "backup"; secretKey: string; onBackupSuccess?: () => void }
  | { mode: "restore"; onRestoreSuccess: (secretKey: string) => void | Promise<void> };

function describeError(err: unknown): string | null {
  if (err instanceof GoogleSignInCancelledError) return null;
  if (err instanceof GoogleSignInFailedError) return "Google sign-in didn't complete. Please try again.";
  if (err instanceof DecryptionError) return "That passphrase doesn't match this backup.";
  const message = (err as Error).message;
  if (
    message === "No Liber backup found in this Google account." ||
    message === "This backup was made with a newer version of Liber."
  ) {
    return message;
  }
  return "Couldn't reach Google Drive. Try again.";
}

export function GoogleDriveBackupCard(props: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleBackup() {
    if (props.mode !== "backup") return;
    setError(null);
    setSuccess(false);
    if (passphrase.length < 8) {
      setError("Choose a passphrase of at least 8 characters.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const accessToken = await requestAccessToken(GOOGLE_CLIENT_ID);
      await backupToGoogleDrive(accessToken, props.secretKey, passphrase);
      setSuccess(true);
      setPassphrase("");
      setConfirmPassphrase("");
      props.onBackupSuccess?.();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore() {
    if (props.mode !== "restore") return;
    setError(null);
    setSuccess(false);
    if (!passphrase) {
      setError("Enter the passphrase you backed up with.");
      return;
    }

    setSubmitting(true);
    try {
      const accessToken = await requestAccessToken(GOOGLE_CLIENT_ID);
      const secretKey = await restoreFromGoogleDrive(accessToken, passphrase);
      await props.onRestoreSuccess(secretKey);
      setSuccess(true);
      setPassphrase("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (props.mode === "backup") {
    return (
      <div className="flex flex-col gap-3">
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Choose a passphrase"
          className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
        />
        <input
          type="password"
          value={confirmPassphrase}
          onChange={(e) => setConfirmPassphrase(e.target.value)}
          placeholder="Confirm passphrase"
          className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
        />
        <Button variant="secondary" onClick={handleBackup} disabled={submitting}>
          {submitting ? "Backing up..." : "Back up with Google Drive"}
        </Button>
        {error && <p className="text-sm text-rose">{error}</p>}
        {success && !error && <p className="text-sm text-emerald">Backed up to Google Drive.</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="Backup passphrase"
        className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
      />
      <Button variant="ghost" onClick={handleRestore} disabled={submitting}>
        {submitting ? "Restoring..." : "Restore from Google Drive"}
      </Button>
      {error && <p className="text-sm text-rose">{error}</p>}
      {success && !error && <p className="text-sm text-emerald">Wallet restored from Google Drive.</p>}
    </div>
  );
}
