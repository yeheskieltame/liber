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
const FUNDING_RESERVE_BUFFER_XLM = 1; // keeps the funding account itself above the Stellar minimum balance

function server() {
  return new Horizon.Server(HORIZON_URL());
}

export class InsufficientFundingBalanceError extends Error {
  constructor(availableXlm: string, requiredXlm: string) {
    super(
      `Funding account balance (${availableXlm} XLM) is below what's needed to create a new account (${requiredXlm} XLM). The operator needs to top up the funding account.`
    );
    this.name = "InsufficientFundingBalanceError";
  }
}

export function assertSufficientFundingBalance(nativeBalanceXlm: string, startingBalanceXlm: string): void {
  const available = Number(nativeBalanceXlm);
  const required = Number(startingBalanceXlm) + FUNDING_RESERVE_BUFFER_XLM;
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
  assertSufficientFundingBalance(nativeBalance, params.startingBalanceXlm);
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
