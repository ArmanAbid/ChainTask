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
 * After this finishes, the frontend's `contractsDeployed` flag flips to
 * true and the chain reads start returning real data instead of empty
 * arrays.
 *
 * USAGE
 * -----
 *   1. Make sure contracts/ has been built recently:
 *        cd contracts && aiken build && cd ..
 *
 *   2. Make sure you have these env vars set (in shell or .env.local):
 *        DEPLOY_SEED       — 24-word BIP39 seed phrase for the deploy wallet
 *                            (this wallet should be funded with ~5 tADA on Preview)
 *        BLOCKFROST_KEY    — Blockfrost Preview project ID
 *        TREASURY_ADDRESS  — bech32 of the wallet that should receive platform fees
 *                            (can be the same as the deploy wallet if you like)
 *
 *   3. Run:
 *        node scripts/deploy.mjs
 *
 *   4. Check the printed output for the deploy tx hash, wait ~30s for
 *      confirmation, then verify on https://preview.cardanoscan.io/.
 *
 *   5. Restart the frontend dev server to pick up the new env values.
 *
 * SAFETY NOTES
 * ------------
 *   - The DEPLOY_SEED never leaves this script. Don't paste it anywhere.
 *   - This script is non-idempotent: running it twice deploys two
 *     separate admin policies and GlobalConfig UTxOs. The second
 *     overrides the first in the frontend env, but the first set of
 *     UTxOs and their tADA are stranded. Run it once.
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

// GlobalConfig values (mirror config/protocol.ts)
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

if (!DEPLOY_SEED) bail("DEPLOY_SEED env var is required (24-word seed phrase)");
if (!BLOCKFROST_KEY) bail("BLOCKFROST_KEY env var is required");
if (!TREASURY_ADDRESS) bail("TREASURY_ADDRESS env var is required (bech32)");

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

  // Check balance — need enough for minting + GlobalConfig UTxO + fees
  const utxos = await lucid.wallet().getUtxos();
  const total = utxos.reduce((sum, u) => sum + (u.assets.lovelace ?? 0n), 0n);
  if (total < 5_000_000n) {
    bail(`Wallet has only ${Number(total) / 1_000_000} ADA. Need at least 5 tADA to deploy.`);
  }
  log(`  ✓ balance: ${(Number(total) / 1_000_000).toFixed(2)} tADA\n`);

  // 3. Build the admin minting policy
  //    Native script: requires admin's signature. After deploy, never re-sign
  //    with this key to mint more admin NFTs. (Strictly: anyone with the key
  //    can mint; for stronger one-shot guarantees use a Plutus minter that
  //    consumes a specific UTxO. Acceptable for hackathon.)
  log("Building admin minting policy...");
  const adminPolicy = {
    type: "all",
    scripts: [{ type: "sig", keyHash: adminCred.hash }],
  };
  const adminPolicyScript = lucid.utils
    ? lucid.utils.nativeScriptFromJson(adminPolicy)
    : nativeScriptFromJsonFallback(adminPolicy);
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

  // 6. Build, sign, submit the deploy tx:
  //    - mint 1 admin NFT
  //    - send the NFT + 2 ADA + GlobalConfig datum back to admin address
  log("Building deploy transaction...");
  const tx = await lucid
    .newTx()
    .mintAssets({ [adminUnit]: 1n }, Data.void())
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

  // 7. Find the GlobalConfig out-ref. After awaitTx the UTxO is queryable;
  //    it's the output that holds the admin NFT.
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
  log("Next: restart the dev server so Vite picks up the new env vars.");
  log("      cd frontend && npm run dev\n");
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(msg + "\n");
}

/**
 * Convert a bech32 address to the Plutus Address record. Mirrors
 * src/lib/tx/address.ts:bech32ToAddress so this script is standalone.
 */
function bech32ToAddressRecord(bech32) {
  // We use Lucid's getAddressDetails inside main(); duplicate the logic here.
  // Importing dynamically because main is async.
  const { getAddressDetails } = require("@lucid-evolution/lucid");
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

/**
 * Fallback constructor for native scripts in case lucid.utils isn't available.
 * Builds the same shape via direct field assignment.
 */
function nativeScriptFromJsonFallback(json) {
  return { type: "Native", script: JSON.stringify(json) };
}

/**
 * Update (or create) the .env.local file with the new values.
 * Existing entries for these keys are replaced; everything else stays.
 */
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

/**
 * Update src/lib/tx/scripts.ts with the compiled CBOR. Replaces the three
 * empty-string constants in-place.
 */
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
