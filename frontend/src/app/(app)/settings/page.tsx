"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Keypair } from "@stellar/stellar-sdk";
import { PageShell } from "@/components/ui/PageShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ShieldIcon, DocumentIcon } from "@/components/icons";
import { getOrCreateWallet, importWallet, LocalStorageWalletStorage } from "@/lib/wallet/storage";
import { getUserIdByKey } from "@/lib/api";
import { GoogleDriveBackupCard } from "@/components/GoogleDriveBackupCard";

const USER_ID_KEY = "liber:userId";

export default function SettingsPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [walletSecretKey, setWalletSecretKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [importInput, setImportInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  useEffect(() => {
    getOrCreateWallet(new LocalStorageWalletStorage()).then((wallet) => {
      setAddress(wallet.publicKey);
      setWalletSecretKey(wallet.secretKey);
    });
  }, []);

  function handleReveal() {
    getOrCreateWallet(new LocalStorageWalletStorage()).then((wallet) => {
      setSecretKey(wallet.secretKey);
      setRevealed(true);
    });
  }

  async function handleImport() {
    setImportError(null);
    setImportSuccess(false);
    setImporting(true);

    let publicKey: string;
    try {
      publicKey = Keypair.fromSecret(importInput.trim()).publicKey();
    } catch {
      setImportError("That doesn't look like a valid Stellar secret key. It should start with S.");
      setImporting(false);
      return;
    }

    try {
      const match = await getUserIdByKey(publicKey);
      const wallet = await importWallet(new LocalStorageWalletStorage(), importInput.trim());
      if (match) {
        window.localStorage.setItem(USER_ID_KEY, match.userId);
      } else {
        window.localStorage.removeItem(USER_ID_KEY);
        setImportError(
          "This key has never been used with Liber. Restored the wallet, but there's no account history to recover."
        );
      }
      setAddress(wallet.publicKey);
      setWalletSecretKey(wallet.secretKey);
      setImportInput("");
      setImportSuccess(true);
    } catch {
      setImportError("Couldn't reach Liber's servers. Try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <PageShell>
      <h1 className="font-display text-2xl italic text-ink">Settings</h1>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink/50">Backup &amp; Recovery</p>
      <Card className="mt-3 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald" />
          <p className="text-sm text-ink/60">
            Liber is non-custodial: your wallet lives only on this device. Losing this browser without a backup
            means losing access. Back up your secret key now, and use it to restore your wallet on any device.
          </p>
        </div>

        {!revealed ? (
          <Button variant="ghost" onClick={handleReveal}>
            Reveal Secret Key
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="rounded-2xl bg-rose/10 px-4 py-3 text-xs text-rose">
              Anyone with this key can move your funds. Never share it, screenshot it, or type it into a website
              other than Liber.
            </p>
            <p className="break-all rounded-2xl bg-paper px-4 py-3 font-mono text-xs text-ink/70">{secretKey}</p>
            <Button
              variant="secondary"
              onClick={() => {
                if (secretKey) navigator.clipboard.writeText(secretKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy Secret Key"}
            </Button>
          </div>
        )}

        <div className="h-px bg-ink/10" />

        <div>
          <p className="text-sm font-semibold text-ink">Restore on this device</p>
          <p className="mt-1 text-xs text-ink/50">
            Already have a Liber secret key from another device? Paste it here to switch this device to that
            wallet. This replaces the wallet currently active on this device.
          </p>
        </div>
        <input
          value={importInput}
          onChange={(e) => setImportInput(e.target.value)}
          placeholder="Secret key (S...)"
          className="w-full rounded-2xl bg-paper px-4 py-3 font-mono text-sm text-ink placeholder:text-ink/40 outline-none ring-1 ring-transparent focus:ring-emerald"
        />
        <Button variant="ghost" onClick={handleImport} disabled={importing || !importInput}>
          {importing ? "Restoring..." : "Restore Wallet"}
        </Button>
        {importError && <p className="text-sm text-rose">{importError}</p>}
        {importSuccess && !importError && <p className="text-sm text-emerald">Wallet restored on this device.</p>}

        <div className="h-px bg-ink/10" />

        <div>
          <p className="text-sm font-semibold text-ink">Back up to Google Drive</p>
          <p className="mt-1 text-xs text-ink/50">
            Encrypt your secret key with a passphrase you choose and store it in your own Google Drive. Google
            never sees the passphrase or the key itself.
          </p>
        </div>
        {walletSecretKey && <GoogleDriveBackupCard mode="backup" secretKey={walletSecretKey} />}

        <div className="h-px bg-ink/10" />

        <div>
          <p className="text-sm font-semibold text-ink">Restore from Google Drive</p>
          <p className="mt-1 text-xs text-ink/50">
            Already backed up a Liber wallet to Google Drive? Restore it here.
          </p>
        </div>
        <GoogleDriveBackupCard
          mode="restore"
          onRestoreSuccess={async (restoredSecretKey) => {
            setImportError(null);
            setImportSuccess(false);
            try {
              const publicKey = Keypair.fromSecret(restoredSecretKey).publicKey();
              const match = await getUserIdByKey(publicKey);
              const wallet = await importWallet(new LocalStorageWalletStorage(), restoredSecretKey);
              if (match) {
                window.localStorage.setItem(USER_ID_KEY, match.userId);
              } else {
                window.localStorage.removeItem(USER_ID_KEY);
                setImportError(
                  "This key has never been used with Liber. Restored the wallet, but there's no account history to recover."
                );
              }
              setAddress(wallet.publicKey);
              setWalletSecretKey(wallet.secretKey);
              setImportSuccess(true);
            } catch {
              setImportError("Couldn't reach Liber's servers. Try again.");
            }
          }}
        />
      </Card>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink/50">Wallet Address</p>
      <Card className="mt-3">
        <p className="break-all font-mono text-xs text-ink/60">{address ?? "Loading..."}</p>
      </Card>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink/50">Legal</p>
      <Link href="/terms" className="mt-3 block">
        <Card className="flex items-center gap-3">
          <DocumentIcon className="h-5 w-5 text-emerald" />
          <span className="text-sm font-semibold text-ink">Terms &amp; Conditions</span>
        </Card>
      </Link>

      <p className="mt-8 text-center text-xs text-ink/30">Liber v0.1, built on Stellar</p>
    </PageShell>
  );
}
