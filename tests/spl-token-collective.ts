import {
  createNameRegistry,
  getHashedName,
  getNameAccountKey,
  NameRegistryState,
} from "@solana/spl-name-service";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { NATIVE_MINT } from "@solana/spl-token";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  ExponentialCurveConfig,
  SplTokenBonding,
} from "@strata-foundation/spl-token-bonding";
import {
  sendMultipleInstructions,
  SplTokenMetadata,
  percent,
  createMint,
  createAtaAndMint,
} from "@strata-foundation/spl-utils";
import { expect, use } from "chai";
import ChaiAsPromised from "chai-as-promised";
import { TokenUtils } from "./utils/token";

use(ChaiAsPromised);

describe("spl-token-collective", () => {
});
