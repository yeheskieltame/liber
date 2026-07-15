"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { signXdr } from "@/lib/wallet/keypair";
import { createUser, confirmTrustline } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const USER_ID_KEY = "liber:userId";

export function OnboardingForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSubmitting(true);
    setError(null);

    try {
      const wallet = await getOrCreateWallet(new LocalStorageWalletStorage());
      const { userId, unsignedTrustlineXdr } = await createUser({ stellarPublicKey: wallet.publicKey });

      const signedXdr = signXdr(wallet.secretKey, unsignedTrustlineXdr, NETWORK_PASSPHRASE);
      await confirmTrustline(userId, signedXdr);

      window.localStorage.setItem(USER_ID_KEY, userId);
      router.push("/home");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 text-center">
        <p className="text-sm text-ink/60">
          We&apos;ll create a new Stellar wallet for you, ready to receive USDC.
        </p>
      </Card>

      {error && <p className="text-sm text-rose">{error}</p>}

      <Button onClick={handleCreate} disabled={submitting}>
        {submitting ? "Setting up..." : "Create Wallet"}
      </Button>
    </div>
  );
}
