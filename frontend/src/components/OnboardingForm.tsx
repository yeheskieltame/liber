"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Keypair } from "@stellar/stellar-sdk";
import { getOrCreateWallet, importWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { createUser, confirmTrustline, getUserIdByKey } from "@/lib/api";
import { requestAccessToken, GoogleSignInCancelledError, GoogleSignInFailedError } from "@/lib/backup/googleDrive";
import { checkExistingBackup, restoreFromGoogleDrive, backupToGoogleDrive } from "@/lib/backup/driveBackup";
import { DecryptionError } from "@/lib/backup/crypto";
import { connectExternalWallet } from "@/lib/wallet/externalWallet";
import { setExternalWalletMode, signActiveWallet, type ActiveWallet } from "@/lib/wallet/activeWallet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const ACTIVATION_BALANCE_XLM = 2;

type Step = "start" | "awaiting-funding" | "restore-passphrase" | "backup-passphrase";

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [newSecretKey, setNewSecretKey] = useState<string | null>(null);
  const [pendingWallet, setPendingWallet] = useState<ActiveWallet | null>(null);
  const [pendingQrDataUrl, setPendingQrDataUrl] = useState<string | null>(null);

  /** Returns true once the account is fully created/activated; false if it's still waiting on a deposit. */
  async function tryCreateAccount(wallet: ActiveWallet): Promise<boolean> {
    const result = await createUser({ stellarPublicKey: wallet.publicKey });
    if (result.status === "awaiting_funding") {
      setPendingWallet(wallet);
      setPendingQrDataUrl(await QRCode.toDataURL(wallet.publicKey));
      return false;
    }
    const signedXdr = await signActiveWallet(wallet, result.unsignedTrustlineXdr, NETWORK_PASSPHRASE);
    await confirmTrustline(result.userId, signedXdr);
    window.localStorage.setItem(USER_ID_KEY, result.userId);
    return true;
  }

  async function createLocalWallet(): Promise<ActiveWallet> {
    const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());
    return { mode: "local", publicKey: wallet.publicKey, secretKey: wallet.secretKey };
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
      const wallet = await createLocalWallet();
      const created = await tryCreateAccount(wallet);
      if (created && wallet.mode === "local") {
        setNewSecretKey(wallet.secretKey);
        setStep("backup-passphrase");
      } else if (!created) {
        setStep("awaiting-funding");
      }
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
      const wallet = await createLocalWallet();
      const created = await tryCreateAccount(wallet);
      if (created) {
        router.push("/home");
      } else {
        setStep("awaiting-funding");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConnectWallet() {
    setError(null);
    setSubmitting(true);
    try {
      const publicKey = await connectExternalWallet();
      setExternalWalletMode();
      const wallet: ActiveWallet = { mode: "external", publicKey };
      const created = await tryCreateAccount(wallet);
      if (created) {
        router.push("/home");
      } else {
        setStep("awaiting-funding");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckFunding() {
    if (!pendingWallet) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await tryCreateAccount(pendingWallet);
      if (!created) {
        setError("Still waiting for your deposit to arrive. This can take a minute or two.");
        return;
      }
      if (pendingWallet.mode === "local" && accessToken) {
        setNewSecretKey(pendingWallet.secretKey);
        setStep("backup-passphrase");
      } else {
        router.push("/home");
      }
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

    let secretKey: string;
    try {
      secretKey = await restoreFromGoogleDrive(accessToken, passphrase);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof DecryptionError) {
        setError("That passphrase doesn't match this backup.");
      } else {
        setError("Couldn't restore this backup. Try again.");
      }
      return;
    }

    try {
      const publicKey = Keypair.fromSecret(secretKey).publicKey();
      const match = await getUserIdByKey(publicKey);
      await importWallet(new LocalStorageWalletStorage(), secretKey);
      if (match) {
        window.localStorage.setItem(USER_ID_KEY, match.userId);
      } else {
        window.localStorage.removeItem(USER_ID_KEY);
      }
      router.push("/home");
    } catch {
      setError("Couldn't reach Liber's servers. Try again.");
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

  if (step === "awaiting-funding") {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-ink/60">
            Send at least {ACTIVATION_BALANCE_XLM} XLM to this address to activate your wallet. You can send it from
            any exchange or wallet you already use.
          </p>
          {pendingQrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingQrDataUrl} alt="Your Stellar address" width={160} height={160} />
          )}
          {pendingWallet && (
            <p className="break-all rounded-2xl bg-paper px-4 py-3 font-mono text-xs text-ink/70">
              {pendingWallet.publicKey}
            </p>
          )}
        </Card>
        {error && <p className="text-sm text-rose">{error}</p>}
        <Button onClick={handleCheckFunding} disabled={submitting}>
          {submitting ? "Checking..." : "I've sent it - Check Again"}
        </Button>
      </div>
    );
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
          Continue with Google or connect an existing wallet to restore an account, or create a new one instantly.
        </p>
      </Card>

      {error && <p className="text-sm text-rose">{error}</p>}

      <Button onClick={handleContinueWithGoogle} disabled={submitting}>
        {submitting ? "Checking..." : "Continue with Google"}
      </Button>
      <Button variant="secondary" onClick={handleConnectWallet} disabled={submitting}>
        {submitting ? "Connecting..." : "Connect Wallet"}
      </Button>
      <Button variant="ghost" onClick={handleContinueWithoutGoogle} disabled={submitting}>
        Continue without Google
      </Button>
    </div>
  );
}
