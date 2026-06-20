#!/usr/bin/env node
/**
 * ChainTask deployment script — Preview testnet.
 *
 * One-shot script you run locally to bootstrap the contracts on chain.
 * Reads the compiled validators from ../contracts/plutus.json, mints
 * the admin NFT, posts the GlobalConfig reference UTxO, then writes the
 * resulting addresses + script CBOR back into:
 *
 *   - frontend/.env.local                        (env vars)
 *   - frontend/src/lib/tx/scripts.ts             (compiled CBOR constants)
 *
 * USAGE
 * -----
 *   1. Make sure contracts are built:
 *        cd contracts && aiken build && cd ..
 *
 *   2. Set these env vars in your shell:
 *        DEPLOY_SEED       — seed phrase for the deploy wallet
 *        BLOCKFROST_KEY    — Blockfrost Preview project ID
 *        TREASURY_ADDRESS  — bech32 address that receives platform fees
 *
 *   3. Run:
 *        node scripts/deploy.mjs
 *
 *   4. Wait for confirmation, then verify on https://preview.cardanoscan.io/
 *
 * SAFETY
 * ------
 *   The DEPLOY_SEED only lives in your shell. Don't commit it. Use a
 *   wallet that holds only testnet ADA — don't reuse a seed that
 *   controls anything important.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Blockfrost,
  Lucid,
  Data,
  applyParamsToScript,
  validatorToAddress,
  validatorToScriptHash,
  paymentCredentialOf,
  mintingPolicyToId,
  getAddressDetails,
  fromText,
} from "@lucid-evolution/lucid";

// ──────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTRACTS_DIR = path.resolve(ROOT, "..", "contracts");
const ENV_FILE = path.join(ROOT, ".env.local");
const SCRIPTS_FILE = path.join(ROOT, "src", "lib", "tx", "scripts.ts");

const NETWORK = "Preview";
const ADMIN_ASSET_NAME = "ChainTaskAdmin";

const GLOBAL_CONFIG = {
  minJobAmountLovelace: 20_000_000n,        // 20 ADA
  platformCutPercent: 5n,                    // 5%
  disputeFeeLovelace: 15_000_000n,           // 15 ADA
};

// ──────────────────────────────────────────────────────────────────────
// Env validation
// ──────────────────────────────────────────────────────────────────────

const DEPLOY_SEED = process.env.DEPLOY_SEED?.trim();
const BLOCKFROST_KEY = process.env.BLOCKFROST_KEY?.trim();
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS?.trim();

if (!DEPLOY_SEED) bail("DEPLOY_SEED env var is required");
if (!BLOCKFROST_KEY) bail("BLOCKFROST_KEY env var is required");
if (!TREASURY_ADDRESS) bail("TREASURY_ADDRESS env var is required");

function bail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────
// Schemas (duplicated from src/lib/tx/schemas.ts so this script stands alone)
// ──────────────────────────────────────────────────────────────────────

const CredentialSchema = Data.Enum([
  Data.Object({ VerificationKey: Data.Tuple([Data.Bytes({ minLength: 28, maxLength: 28 })]) }),
  Data.Object({ Script: Data.Tuple([Data.Bytes({ minLength: 28, maxLength: 28 })]) }),
]);
const StakeCredentialSchema = Data.Enum([
  Data.Object({ Inline: Data.Tuple([CredentialSchema]) }),
  Data.Object({
    Pointer: Data.Object({
      slot_number: Data.Integer(),
      transaction_index: Data.Integer(),
      certificate_index: Data.Integer(),
    }),
  }),
]);
const AddressSchema = Data.Object({
  payment_credential: CredentialSchema,
  stake_credential: Data.Nullable(StakeCredentialSchema),
});
const GlobalConfigSchema = Data.Object({
  treasury_address: AddressSchema,
  min_job_amount_lovelace: Data.Integer(),
  platform_cut_percent: Data.Integer(),
  dispute_fee_lovelace: Data.Integer(),
});

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

async function main() {
  log("🚀 ChainTask deploy — Preview testnet\n");

  // 1. Load compiled validators
  log("Loading plutus.json...");
  const plutusJsonPath = path.join(CONTRACTS_DIR, "plutus.json");
  if (!fs.existsSync(plutusJsonPath)) {
    bail(`plutus.json not found at ${plutusJsonPath}. Run 'aiken build' in contracts/ first.`);
  }
  const plutus = JSON.parse(fs.readFileSync(plutusJsonPath, "utf8"));
  const validators = Object.fromEntries(
    plutus.validators.map((v) => [v.title, v.compiledCode])
  );
  const ESCROW_CBOR = validators["escrow.escrow.spend"];
  const REPUTATION_CBOR = validators["reputation.reputation.spend"];
  const PROFILE_CBOR = validators["profile.profile.spend"];
  if (!ESCROW_CBOR) bail("escrow.escrow.spend not in plutus.json");
  if (!REPUTATION_CBOR) bail("reputation.reputation.spend not in plutus.json");
  if (!PROFILE_CBOR) bail("profile.profile.spend not in plutus.json");
  log("  ✓ found 3 validators\n");

  // 2. Connect Lucid + load wallet
  log("Connecting to Blockfrost Preview...");
  const lucid = await Lucid(
    new Blockfrost("https://cardano-preview.blockfrost.io/api/v0", BLOCKFROST_KEY),
    NETWORK,
  );
  lucid.selectWallet.fromSeed(DEPLOY_SEED);
  const adminAddress = await lucid.wallet().address();
  const adminCred = paymentCredentialOf(adminAddress);
  log(`  ✓ deploy wallet: ${adminAddress.slice(0, 20)}...${adminAddress.slice(-8)}\n`);

  // Check balance
  const utxos = await lucid.wallet().getUtxos();
  const total = utxos.reduce((sum, u) => sum + (u.assets.lovelace ?? 0n), 0n);
  if (total < 5_000_000n) {
    bail(`Wallet has only ${Number(total) / 1_000_000} ADA. Need at least 5 tADA to deploy.`);
  }
  log(`  ✓ balance: ${(Number(total) / 1_000_000).toFixed(2)} tADA\n`);

  // 3. Build the admin minting policy as a Native script.
  //    Plain sig-required: anyone holding the admin key can mint, no one
  //    else can. After deploy, don't sign with this key again to mint
  //    more admin NFTs.
  log("Building admin minting policy...");
  const adminNativeJson = {
    type: "all",
    scripts: [{ type: "sig", keyHash: adminCred.hash }],
  };
  const adminPolicyCbor = nativeScriptToCbor(adminNativeJson);
  const adminPolicyScript = { type: "Native", script: adminPolicyCbor };
  const adminPolicyId = mintingPolicyToId(adminPolicyScript);
  const adminAssetNameHex = fromText(ADMIN_ASSET_NAME);
  const adminUnit = adminPolicyId + adminAssetNameHex;
  log(`  ✓ admin policy id:  ${adminPolicyId}`);
  log(`  ✓ admin asset name: ${ADMIN_ASSET_NAME} (hex: ${adminAssetNameHex})\n`);

  // 4. Compute parameterized validator addresses
  log("Computing script addresses...");
  const escrowApplied = applyParamsToScript(ESCROW_CBOR, [adminPolicyId]);
  const escrowValidator = { type: "PlutusV3", script: escrowApplied };
  const escrowAddress = validatorToAddress(NETWORK, escrowValidator);
  const escrowHash = validatorToScriptHash(escrowValidator);
  log(`  ✓ escrow:     ${escrowAddress}`);

  const reputationApplied = applyParamsToScript(REPUTATION_CBOR, [escrowHash]);
  const reputationValidator = { type: "PlutusV3", script: reputationApplied };
  const reputationAddress = validatorToAddress(NETWORK, reputationValidator);
  log(`  ✓ reputation: ${reputationAddress}`);

  const profileValidator = { type: "PlutusV3", script: PROFILE_CBOR };
  const profileAddress = validatorToAddress(NETWORK, profileValidator);
  log(`  ✓ profile:    ${profileAddress}\n`);

  // 5. Build GlobalConfig datum
  log("Building GlobalConfig datum...");
  const globalConfigDatum = {
    treasury_address: bech32ToAddressRecord(TREASURY_ADDRESS),
    min_job_amount_lovelace: GLOBAL_CONFIG.minJobAmountLovelace,
    platform_cut_percent: GLOBAL_CONFIG.platformCutPercent,
    dispute_fee_lovelace: GLOBAL_CONFIG.disputeFeeLovelace,
  };
  const globalConfigCbor = Data.to(globalConfigDatum, GlobalConfigSchema);
  log("  ✓ datum encoded\n");

  // 6. Build, sign, submit the deploy tx
  //    - mint 1 admin NFT
  //    - send the NFT + 2 ADA + GlobalConfig datum back to admin address
  //
  //    Native scripts don't take a redeemer when minting — we pass undefined.
  log("Building deploy transaction...");
  const tx = await lucid
    .newTx()
    .mintAssets({ [adminUnit]: 1n })
    .attach.MintingPolicy(adminPolicyScript)
    .pay.ToAddressWithData(
      adminAddress,
      { kind: "inline", value: globalConfigCbor },
      { [adminUnit]: 1n, lovelace: 2_000_000n },
    )
    .complete();
  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();
  log(`  ✓ tx submitted: ${txHash}\n`);
  log("  Waiting for confirmation (this takes ~30s on Preview)...");
  await lucid.awaitTx(txHash);
  log("  ✓ confirmed\n");

  // 7. Find the GlobalConfig out-ref by the admin NFT
  const adminUtxos = await lucid.wallet().getUtxos();
  const gcUtxo = adminUtxos.find((u) => (u.assets[adminUnit] ?? 0n) > 0n);
  if (!gcUtxo) bail("Could not locate GlobalConfig UTxO after confirmation");
  const gcOutRef = `${gcUtxo.txHash}#${gcUtxo.outputIndex}`;
  log(`  ✓ GlobalConfig: ${gcOutRef}\n`);

  // 8. Write outputs
  log("Writing artifacts...");
  writeEnvFile({
    VITE_ESCROW_SCRIPT_ADDRESS: escrowAddress,
    VITE_REPUTATION_SCRIPT_ADDRESS: reputationAddress,
    VITE_PROFILE_SCRIPT_ADDRESS: profileAddress,
    VITE_ADMIN_POLICY_ID: adminPolicyId,
    VITE_ADMIN_ASSET_NAME: adminAssetNameHex,
    VITE_TREASURY_ADDRESS: TREASURY_ADDRESS,
    VITE_GLOBAL_CONFIG_OUTREF: gcOutRef,
  });
  log(`  ✓ ${path.relative(ROOT, ENV_FILE)} updated`);

  writeScriptsFile({
    escrow: ESCROW_CBOR,
    reputation: REPUTATION_CBOR,
    profile: PROFILE_CBOR,
  });
  log(`  ✓ ${path.relative(ROOT, SCRIPTS_FILE)} updated\n`);

  log("✓ Deploy complete.\n");
  log(`  View on cardanoscan: https://preview.cardanoscan.io/transaction/${txHash}`);
  log("  Restart the dev server to pick up the new env values.\n");
}

// ──────────────────────────────────────────────────────────────────────
// Address helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Convert a bech32 address to the Plutus Address record. Mirrors
 * src/lib/tx/address.ts:bech32ToAddress.
 */
function bech32ToAddressRecord(bech32) {
  const details = getAddressDetails(bech32);
  if (!details.paymentCredential) {
    throw new Error(`Address has no payment credential: ${bech32}`);
  }
  const payment_credential =
    details.paymentCredential.type === "Key"
      ? { VerificationKey: [details.paymentCredential.hash] }
      : { Script: [details.paymentCredential.hash] };
  if (!details.stakeCredential) {
    return { payment_credential, stake_credential: null };
  }
  const inner =
    details.stakeCredential.type === "Key"
      ? { VerificationKey: [details.stakeCredential.hash] }
      : { Script: [details.stakeCredential.hash] };
  return { payment_credential, stake_credential: { Inline: [inner] } };
}

// ──────────────────────────────────────────────────────────────────────
// Native script CBOR encoding (CIP-1854)
//
// We encode by hand because Lucid Evolution's helper for this has been
// moving across releases. The CBOR shape per the spec:
//
//   native_script =
//       [0, addr_keyhash]                    ; sig
//     | [1, [* native_script]]                ; all
//     | [2, [* native_script]]                ; any
//     | [3, n, [* native_script]]             ; n-of-k
//     | [4, slot]                             ; invalid_before
//     | [5, slot]                             ; invalid_hereafter
// ──────────────────────────────────────────────────────────────────────

function nativeScriptToCbor(json) {
  function encode(s) {
    switch (s.type) {
      case "sig":
        return cborArray([cborInt(0), cborBytes(s.keyHash)]);
      case "all":
        return cborArray([cborInt(1), cborArray(s.scripts.map(encode))]);
      case "any":
        return cborArray([cborInt(2), cborArray(s.scripts.map(encode))]);
      case "atLeast":
        return cborArray([cborInt(3), cborInt(s.required), cborArray(s.scripts.map(encode))]);
      case "before":
        return cborArray([cborInt(4), cborInt(s.slot)]);
      case "after":
        return cborArray([cborInt(5), cborInt(s.slot)]);
      default:
        throw new Error(`Unknown native script type: ${s.type}`);
    }
  }
  const buf = encode(json);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function cborInt(n) {
  n = Number(n);
  if (n < 0) throw new Error("negative ints not supported");
  if (n < 24) return new Uint8Array([n]);
  if (n < 256) return new Uint8Array([0x18, n]);
  if (n < 65536) return new Uint8Array([0x19, (n >> 8) & 0xff, n & 0xff]);
  if (n < 4294967296)
    return new Uint8Array([0x1a, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
  const buf = new Uint8Array(9);
  buf[0] = 0x1b;
  const big = BigInt(n);
  for (let i = 0; i < 8; i++) buf[8 - i] = Number((big >> BigInt(8 * i)) & 0xffn);
  return buf;
}

function cborBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  const len = lenHeader(0x40, bytes.length);
  return concat(len, bytes);
}

function cborArray(items) {
  const len = lenHeader(0x80, items.length);
  return concat(len, ...items);
}

function lenHeader(major, len) {
  if (len < 24) return new Uint8Array([major | len]);
  if (len < 256) return new Uint8Array([major | 24, len]);
  if (len < 65536) return new Uint8Array([major | 25, (len >> 8) & 0xff, len & 0xff]);
  throw new Error(`length too large: ${len}`);
}

function concat(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// File output helpers
// ──────────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(msg + "\n");
}

function writeEnvFile(updates) {
  let existing = "";
  if (fs.existsSync(ENV_FILE)) {
    existing = fs.readFileSync(ENV_FILE, "utf8");
  }
  const lines = existing.split("\n");
  const keysSet = new Set(Object.keys(updates));
  const filtered = lines.filter((l) => {
    const m = l.match(/^([A-Z_]+)=/);
    return !m || !keysSet.has(m[1]);
  });
  const newLines = Object.entries(updates).map(([k, v]) => `${k}=${v}`);
  const final =
    filtered.join("\n").trimEnd() +
    "\n\n# ChainTask deploy output (auto-written by scripts/deploy.mjs)\n" +
    newLines.join("\n") +
    "\n";
  fs.writeFileSync(ENV_FILE, final);
}

function writeScriptsFile({ escrow, reputation, profile }) {
  let src = fs.readFileSync(SCRIPTS_FILE, "utf8");
  src = src.replace(
    /export const ESCROW_VALIDATOR_CBOR = "[^"]*";/,
    `export const ESCROW_VALIDATOR_CBOR = "${escrow}";`,
  );
  src = src.replace(
    /export const REPUTATION_VALIDATOR_CBOR = "[^"]*";/,
    `export const REPUTATION_VALIDATOR_CBOR = "${reputation}";`,
  );
  src = src.replace(
    /export const PROFILE_VALIDATOR_CBOR = "[^"]*";/,
    `export const PROFILE_VALIDATOR_CBOR = "${profile}";`,
  );
  fs.writeFileSync(SCRIPTS_FILE, src);
}

// ──────────────────────────────────────────────────────────────────────

main().catch((e) => {
  console.error("\n  ✗ Deploy failed:", e?.message ?? e);
  if (e?.stack) console.error(e.stack);
  process.exit(1);
});
