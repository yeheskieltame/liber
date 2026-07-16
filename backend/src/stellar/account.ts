import {
  Account,
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const NETWORK_PASSPHRASE = () => process.env.STELLAR_NETWORK_PASSPHRASE!;
const HORIZON_URL = () => process.env.HORIZON_URL ?? "https://horizon.stellar.org";
const USDC = () => new Asset("USDC", process.env.USDC_ISSUER!);
const BASE_FEE = "10000"; // stroops, generous for mainnet inclusion
const BASE_RESERVE_XLM = 0.5; // current Stellar network base reserve per subentry
const FEE_BUFFER_XLM = 0.01; // generous headroom above the ~0.001 XLM actual fee

function server() {
  return new Horizon.Server(HORIZON_URL());
}

export async function accountExistsOnStellar(
  publicKey: string,
  fetchAccount: (pk: string) => Promise<unknown> = (pk) => server().loadAccount(pk)
): Promise<boolean> {
  try {
    await fetchAccount(publicKey);
    return true;
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return false;
    throw err;
  }
}

export class InsufficientFundingBalanceError extends Error {
  constructor(availableXlm: string, requiredXlm: string) {
    super(
      `Funding account balance (${availableXlm} XLM) is below what's needed to create a new account (${requiredXlm} XLM). The operator needs to top up the funding account.`
    );
    this.name = "InsufficientFundingBalanceError";
  }
}

export function assertSufficientFundingBalance(
  nativeBalanceXlm: string,
  startingBalanceXlm: string,
  fundingAccountSubentryCount: number
): void {
  const available = Number(nativeBalanceXlm);
  const ownReserve = BASE_RESERVE_XLM * (2 + fundingAccountSubentryCount);
  const required = Number(startingBalanceXlm) + ownReserve + FEE_BUFFER_XLM;
  if (available < required) {
    throw new InsufficientFundingBalanceError(available.toFixed(2), required.toFixed(2));
  }
}

export function buildOnboardingTxFromAccount(
  sourceAccount: Account,
  fundingSecret: string,
  newAccountPublicKey: string,
  startingBalanceXlm: string
): { signedXdr: string } {
  const funding = Keypair.fromSecret(fundingSecret);
  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE() })
    .addOperation(Operation.createAccount({ destination: newAccountPublicKey, startingBalance: startingBalanceXlm }))
    .setTimeout(30)
    .build();
  tx.sign(funding);
  return { signedXdr: tx.toXDR() };
}

export async function buildOnboardingTx(params: {
  fundingSecret: string;
  newAccountPublicKey: string;
  startingBalanceXlm: string;
}): Promise<{ signedXdr: string }> {
  const funding = Keypair.fromSecret(params.fundingSecret);
  const sourceAccount = await server().loadAccount(funding.publicKey());
  const nativeBalance = sourceAccount.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  assertSufficientFundingBalance(nativeBalance, params.startingBalanceXlm, sourceAccount.subentry_count);
  return buildOnboardingTxFromAccount(sourceAccount, params.fundingSecret, params.newAccountPublicKey, params.startingBalanceXlm);
}

export function buildTrustlineTxFromAccount(sourceAccount: Account): { unsignedXdr: string } {
  const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE() })
    .addOperation(Operation.changeTrust({ asset: USDC() }))
    .setTimeout(30)
    .build();
  return { unsignedXdr: tx.toXDR() };
}

export async function buildTrustlineTx(params: { accountPublicKey: string }): Promise<{ unsignedXdr: string }> {
  const sourceAccount = await server().loadAccount(params.accountPublicKey);
  return buildTrustlineTxFromAccount(sourceAccount);
}

export async function submitStellarTx(signedXdr: string): Promise<{ hash: string }> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE());
  const response = await server().submitTransaction(tx);
  return { hash: response.hash };
}

let fundingLock: Promise<unknown> = Promise.resolve();

/**
 * Serializes calls through this function so only one funding-account transaction
 * (load -> build -> sign -> submit) is ever in flight at a time, avoiding a sequence-number
 * collision between two concurrent onboarding requests. This protects a single backend
 * instance; it does not span multiple instances if the service is ever horizontally scaled.
 */
export function withFundingLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = fundingLock.then(fn, fn);
  fundingLock = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
