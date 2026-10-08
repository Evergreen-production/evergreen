/**
 * Ledger key builders for Soroban contract entries.
 *
 * All public functions return base64-encoded XDR strings (LedgerKey)
 * suitable for passing directly to the JSON-RPC getLedgerEntries endpoint.
 *
 * We build XDR inline here (rather than via the SDK) so that these base64
 * strings can be passed directly to our raw-fetch RPC client, avoiding the
 * ESM/CJS class identity mismatch in the SDK's getLedgerEntries.
 */

import {
  Address,
  xdr,
  Contract,
  StrKey,
} from "@stellar/stellar-sdk";

/**
 * Build the LedgerKey for a contract's instance entry.
 * This is contractData(contract, scvLedgerKeyContractInstance, persistent).
 */
export function buildContractInstanceKey(contractId: string): string {
  const scAddress = contractIdToScAddress(contractId);
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: scAddress,
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );
  return key.toXDR("base64");
}

/**
 * Build the LedgerKey for a contract's Wasm code entry.
 *
 * The contract instance entry contains the wasm hash. We need to first fetch
 * the instance entry to get the hash, then build the code key.
 *
 * This function takes the raw wasm hash bytes (32 bytes).
 */
export function buildContractCodeKey(wasmHashHex: string): string {
  const hashBytes = Buffer.from(wasmHashHex, "hex");
  const key = xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: hashBytes })
  );
  return key.toXDR("base64");
}

/**
 * Build the LedgerKey for a named persistent ContractData entry.
 * The caller must supply the pre-encoded ScVal key as base64 XDR.
 */
export function buildNamedEntryKey(
  contractId: string,
  keyXdr: string,
  durability: "persistent" | "temporary"
): string {
  const scAddress = contractIdToScAddress(contractId);
  const scKey = xdr.ScVal.fromXDR(keyXdr, "base64");
  const xdrDurability =
    durability === "persistent"
      ? xdr.ContractDataDurability.persistent()
      : xdr.ContractDataDurability.temporary();
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: scAddress,
      key: scKey,
      durability: xdrDurability,
    })
  );
  return key.toXDR("base64");
}

/**
 * Extract the wasm hash from a decoded contract instance LedgerEntryData XDR.
 * Returns the hex string of the wasm hash.
 */
export function extractWasmHashFromInstanceEntry(entryXdr: string): string {
  const ledgerEntry = xdr.LedgerEntry.fromXDR(entryXdr, "base64");
  const contractData = ledgerEntry.data().contractData();
  const instance = contractData.val().instance();
  const executable = instance.executable();
  if (executable.switch().name === "contractExecutableWasm") {
    return Buffer.from(executable.wasmHash()).toString("hex");
  }
  throw new Error("Contract is not a Wasm contract (may be a built-in/StellarAssetContract)");
}

/**
 * Parse the contract ID string (C... strkey) to a ScAddress.
 */
function contractIdToScAddress(contractId: string): xdr.ScAddress {
  const contract = new Contract(contractId);
  return contract.address().toScAddress();
}

/**
 * Validate that a string looks like a valid Soroban contract ID (C... strkey).
 */
export function isValidContractId(id: string): boolean {
  return StrKey.isValidContract(id);
}
