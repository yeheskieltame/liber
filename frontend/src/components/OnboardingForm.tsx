"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateWallet, importWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { createUser, confirmTrustline, getUserIdByKey } from "@/lib/api";
import { requestAccessToken, GoogleSignInCancelledError, GoogleSignInFailedError } from "@/lib/backup/googleDrive";
import { checkExistingBackup, restoreFromGoogleDrive, backupToGoogleDrive } from "@/lib/backup/driveBackup";
import { DecryptionError } from "@/lib/backup/crypto";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

type Step = "start" | "restore-passphrase" | "backup-passphrase";

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [newSecretKey, setNewSecretKey] = useState<string | null>(null);

  async function createLocalAccount(): Promise<string> {
    const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());
    const { userId, unsignedTrustlineXdr } = await createUser({ stellarPublicKey: wallet.publicKey });
    const signedXdr = signXdr(wallet.secretKey, unsignedTrustlineXdr, NETWORK_PASSPHRASE);
    await confirmTrustline(userId, signedXdr);
    window.localStorage.setItem(USER_ID_KEY, userId);
    return wallet.secretKey;
  }

  async function handleContinueWithGoogle() {
    setError(null);
    setSubmitting(true);

    let token: string;
    let hasBackup: boolean;
    try {
      token = await requestAccessToken(GOOGLE_CLIENT_ID);
      hasBackup = await checkExistingBackup(token);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof GoogleSignInCancelledError) {
        // silent - the user declined or closed the consent screen, not an error
      } else if (err instanceof GoogleSignInFailedError) {
        setError("Google sign-in didn't complete. Please try again.");
      } else {
        setError("Couldn't reach Google Drive. Try again, or continue without Google below.");
      }
      return;
    }

    setAccessToken(token);
    if (hasBackup) {
      setStep("restore-passphrase");
      setSubmitting(false);
      return;
    }

    try {
      const secretKey = await createLocalAccount();
      setNewSecretKey(secretKey);
      setStep("backup-passphrase");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContinueWithoutGoogle() {
    setError(null);
    setSubmitting(true);
    try {
      await createLocalAccount();
      router.push("/home");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestoreSubmit() {
    if (!passphrase || !accessToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const secretKey = await restoreFromGoogleDrive(accessToken, passphrase);
      const wallet = await importWallet(new LocalStorageWalletStorage(), secretKey);
      const match = await getUserIdByKey(wallet.publicKey);
      if (match) {
        window.localStorage.setItem(USER_ID_KEY, match.userId);
      }
      router.push("/home");
    } catch (err) {
      if (err instanceof DecryptionError) {
        setError("That passphrase doesn't match this backup.");
      } else {
        setError("Couldn't restore this backup. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBackupSubmit() {
    if (!accessToken || !newSecretKey) return;
    setError(null);
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
      await backupToGoogleDrive(accessToken, newSecretKey, passphrase);
      router.push("/home");
    } catch {
      setError("Couldn't reach Google Drive. Try again, or skip for now.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "restore-passphrase") {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2 text-center">
          <p className="text-sm text-ink/60">
            We found a Liber wallet backed up to this Google account. Enter its passphrase to restore it.
          </p>
        </Card>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Backup passphrase"
          className="w-full rounded-2xl bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
        />
        {error && <p className="text-sm text-rose">{error}</p>}
        <Button onClick={handleRestoreSubmit} disabled={submitting || !passphrase}>
          {submitting ? "Restoring..." : "Restore Wallet"}
        </Button>
      </div>
    );
  }

  if (step === "backup-passphrase") {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2 text-center">
          <p className="text-sm text-ink/60">
            Your wallet is ready. Choose a passphrase to back it up to this Google account now.
          </p>
        </Card>
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
        {error && <p className="text-sm text-rose">{error}</p>}
        <Button onClick={handleBackupSubmit} disabled={submitting}>
          {submitting ? "Backing up..." : "Back Up & Continue"}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/home")} disabled={submitting}>
          Skip for now
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 text-center">
        <p className="text-sm text-ink/60">
          Continue with Google to restore an existing wallet, or create a new one instantly.
        </p>
      </Card>

      {error && <p className="text-sm text-rose">{error}</p>}

      <Button onClick={handleContinueWithGoogle} disabled={submitting}>
        {submitting ? "Checking..." : "Continue with Google"}
      </Button>
      <Button variant="ghost" onClick={handleContinueWithoutGoogle} disabled={submitting}>
        Continue without Google
      </Button>
    </div>
  );
}
