"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { createUser, confirmTrustline } from "@/lib/api";
import { connectExternalWallet } from "@/lib/wallet/externalWallet";
import { setExternalWalletMode, signActiveWallet, type ActiveWallet } from "@/lib/wallet/activeWallet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";
const ACTIVATION_BALANCE_XLM = 2;

type Step = "start" | "awaiting-funding";

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handleCreateWallet() {
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
      router.push("/home");
    } catch (err) {
      setError((err as Error).message);
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

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 text-center">
        <p className="text-sm text-ink/60">Connect an existing wallet, or create a new one instantly.</p>
      </Card>

      {error && <p className="text-sm text-rose">{error}</p>}

      <Button onClick={handleCreateWallet} disabled={submitting}>
        {submitting ? "Setting up..." : "Create New Wallet"}
      </Button>
      <Button variant="secondary" onClick={handleConnectWallet} disabled={submitting}>
        {submitting ? "Connecting..." : "Connect Wallet"}
      </Button>
    </div>
  );
}
