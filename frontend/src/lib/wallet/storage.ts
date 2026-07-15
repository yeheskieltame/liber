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
