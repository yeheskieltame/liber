"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GoogleDriveBackupCard } from "@/components/GoogleDriveBackupCard";
import { getOrCreateWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";

export default function OnboardingBackupPage() {
  const router = useRouter();
  const [secretKey, setSecretKey] = useState<string | null>(null);

  useEffect(() => {
    getOrCreateWallet(new LocalStorageWalletStorage()).then((wallet) => setSecretKey(wallet.secretKey));
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Back up your wallet</h1>
      <p className="mt-2 text-sm text-ink/60">
        Liber lives only on this device. Back it up to your own Google Drive now so you can restore it if you ever
        lose this device.
      </p>

      <Card className="mt-6 flex flex-col gap-4">
        {secretKey && (
          <GoogleDriveBackupCard
            mode="backup"
            secretKey={secretKey}
            onBackupSuccess={() => router.push("/home")}
          />
        )}
      </Card>

      <Button variant="ghost" className="mt-4" onClick={() => router.push("/home")}>
        Skip for now
      </Button>
    </PageShell>
  );
}
