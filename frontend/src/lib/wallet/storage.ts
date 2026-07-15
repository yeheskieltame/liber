import { Keypair } from "@stellar/stellar-sdk";
import { generateKeypair } from "./keypair";

export interface WalletStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class MemoryWalletStorage implements WalletStorage {
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
}

export class LocalStorageWalletStorage implements WalletStorage {
  async get(key: string) {
    return window.localStorage.getItem(key);
  }
  async set(key: string, value: string) {
    window.localStorage.setItem(key, value);
  }
}

const SECRET_KEY = "liber:wallet:secretKey";
const PUBLIC_KEY = "liber:wallet:publicKey";

export async function getOrCreateWallet(
  storage: WalletStorage
): Promise<{ publicKey: string; secretKey: string }> {
  const existingSecret = await storage.get(SECRET_KEY);
  const existingPublic = await storage.get(PUBLIC_KEY);
  if (existingSecret && existingPublic) {
    return { publicKey: existingPublic, secretKey: existingSecret };
  }

  const wallet = generateKeypair();
  await storage.set(SECRET_KEY, wallet.secretKey);
  await storage.set(PUBLIC_KEY, wallet.publicKey);
  return wallet;
}

export async function getStoredWallet(
  storage: WalletStorage
): Promise<{ publicKey: string; secretKey: string } | null> {
  const secretKey = await storage.get(SECRET_KEY);
  const publicKey = await storage.get(PUBLIC_KEY);
  return secretKey && publicKey ? { publicKey, secretKey } : null;
}

/** Restores a wallet from a previously-backed-up secret key, replacing whatever is currently stored. */
export async function importWallet(
  storage: WalletStorage,
  secretKey: string
): Promise<{ publicKey: string; secretKey: string }> {
  const publicKey = Keypair.fromSecret(secretKey).publicKey();
  await storage.set(SECRET_KEY, secretKey);
  await storage.set(PUBLIC_KEY, publicKey);
  return { publicKey, secretKey };
}
