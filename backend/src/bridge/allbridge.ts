import {
  AllbridgeCoreSdk,
  AmountFormat,
  ChainSymbol,
  FeePaymentMethod,
  Messenger,
  nodeRpcUrlsDefault,
  type SendParams,
} from "@allbridge/bridge-core-sdk";
import { rpc as SorobanRpc, TransactionBuilder, Keypair } from "@stellar/stellar-sdk";

function defaultSdk() {
  return new AllbridgeCoreSdk(nodeRpcUrlsDefault);
}

function ensure<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

export async function buildBridgeTx(
  params: { fromAccountAddress: string; toAccountAddress: string; amountUsdc: string },
  sdk: AllbridgeCoreSdk = defaultSdk()
): Promise<{ unsignedXdr: string }> {
  const chainDetailsMap = await sdk.chainDetailsMap();
  const sourceToken = ensure(
    chainDetailsMap[ChainSymbol.SRB].tokens.find((t) => t.symbol === "USDC"),
    "USDC not found on Stellar in Allbridge chain details"
  );
  const destinationToken = ensure(
    chainDetailsMap[ChainSymbol.BAS].tokens.find((t) => t.symbol === "USDC"),
    "USDC not found on Base in Allbridge chain details"
  );

  const sendParams: SendParams = {
    amount: params.amountUsdc,
    fromAccountAddress: params.fromAccountAddress,
    toAccountAddress: params.toAccountAddress,
    sourceToken,
    destinationToken,
    messenger: Messenger.ALLBRIDGE,
    gasFeePaymentMethod: FeePaymentMethod.WITH_STABLECOIN,
  };

  const unsignedXdr = (await sdk.bridge.rawTxBuilder.send(sendParams)) as string;
  return { unsignedXdr };
}

export async function submitBridgeTx(
  signedXdr: string,
  fromAccountAddress: string,
  sdk: AllbridgeCoreSdk = defaultSdk()
): Promise<{ hash: string }> {
  const restoreXdr = await sdk.utils.srb.simulateAndCheckRestoreTxRequiredSoroban(signedXdr, fromAccountAddress);
  if (restoreXdr) {
    // Restore transactions need the same signer; caller is responsible for
    // re-signing if this branch triggers — surfaced as an error for v1 rather
    // than silently failing, since restore requires a round-trip to the
    // frontend for a second signature.
    throw new Error("RESTORE_REQUIRED: resubmit after a Soroban state restore + re-sign");
  }

  const sent = await sdk.utils.srb.sendTransactionSoroban(signedXdr);
  const confirm = await sdk.utils.srb.confirmTx(sent.hash);

  if (confirm.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Bridge transaction failed on-chain: ${sent.hash}`);
  }

  return { hash: sent.hash };
}

export async function getBridgeStatus(
  hash: string,
  sdk: AllbridgeCoreSdk = defaultSdk()
): Promise<"pending" | "confirmed" | "failed"> {
  const confirm = await sdk.utils.srb.confirmTx(hash);
  if (confirm.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return "confirmed";
  if (confirm.status === SorobanRpc.Api.GetTransactionStatus.FAILED) return "failed";
  return "pending";
}
