import * as anchor from "@wum.bo/anchor";
import { Program, BN } from "@wum.bo/anchor";
import { createMetadata, Data, decodeMetadata, METADATA_PROGRAM_ID, extendBorsh } from "@wum.bo/spl-utils";
import { createMintInstructions } from "@project-serum/common";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PublicKey,
  Signer,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { SplWumboIDL } from "./generated/spl-wumbo";
import { SplTokenBonding } from "@wum.bo/spl-token-bonding";
import { PeriodUnit, SplTokenStaking } from "@wum.bo/spl-token-staking";
import { SplTokenAccountSplit } from "@wum.bo/spl-token-account-split";
import { percent } from "@wum.bo/spl-utils";

export * from "./generated/spl-wumbo";

extendBorsh();

interface CreateWumboArgs {
  payer?: PublicKey;
  curve?: PublicKey;
  wumMint?: PublicKey;
}

interface CreateSocialTokenArgs {
  payer?: PublicKey;
  wumbo: PublicKey;
  name?: PublicKey; // Either this or owner needs to be provided
  tokenName: string; // For the token metadata name
  owner?: PublicKey;
}

interface ClaimSocialTokenArgs {
  payer?: PublicKey;
  owner: PublicKey;
  tokenRef: PublicKey;
}

interface UpdateMetadataArgs {
  tokenRef: PublicKey;
  name?: string;
  symbol?: string;
  uri?: string;
}

interface InstructionResult<A> {
  instructions: TransactionInstruction[];
  signers: Signer[];
  output: A;
}

interface BigInstructionResult<A> {
  instructions: TransactionInstruction[][];
  signers: Signer[][];
  output: A;
}

async function promiseAllInOrder<T>(it: (() => Promise<T>)[]): Promise<Iterable<T>> {
  let ret: T[] = [];
  for (const i of it) {
    ret.push(await i());
  }

  return ret;
}

export class SplWumbo {
  program: Program<SplWumboIDL>;
  splTokenBondingProgram: SplTokenBonding;
  splTokenAccountSplitProgram: SplTokenAccountSplit;
  splTokenStakingProgram: SplTokenStaking;

  constructor(opts: {
    program: Program<SplWumboIDL>;
    splTokenBondingProgram: SplTokenBonding;
    splTokenAccountSplitProgram: SplTokenAccountSplit;
    splTokenStakingProgram: SplTokenStaking;
  }) {
    this.program = opts.program;
    this.splTokenBondingProgram = opts.splTokenBondingProgram;
    this.splTokenAccountSplitProgram = opts.splTokenAccountSplitProgram;
    this.splTokenStakingProgram = opts.splTokenStakingProgram;
  }

  get provider() {
    return this.program.provider;
  }

  get programId() {
    return this.program.programId;
  }

  get rpc() {
    return this.program.rpc;
  }

  get instruction() {
    return this.program.instruction;
  }

  get wallet() {
    return this.provider.wallet;
  }

  get account() {
    return this.program.account;
  }

  sendInstructions(instructions: TransactionInstruction[], signers: Signer[]): Promise<string> {
    const tx = new Transaction();
    tx.add(...instructions);
    return this.provider.send(tx, signers);
  }

  async createWumboInstructions({
    payer = this.wallet.publicKey,
    curve,
    wumMint,
  }: CreateWumboArgs): Promise<InstructionResult<{ wumbo: PublicKey }>> {
    const programId = this.programId;
    const instructions: TransactionInstruction[] = [];
    const signers: Signer[] = [];

    // Create WUM base curve
    if (!curve) {
      const {
        output: { curve: curveOut },
        instructions: curveInstructions,
        signers: curveSigners,
      } = await this.splTokenBondingProgram.initializeCurveInstructions({
        curve: {
          // @ts-ignore
          logCurveV0: {
            c: new BN(1000000000000), // 1
            g: new BN(10000000000), // 0.01
            taylorIterations: 15,
          },
        },
        taylorIterations: 15,
      });
      signers.push(...curveSigners);
      instructions.push(...curveInstructions);
      curve = curveOut;
    }

    const [wumbo, wumboBump] = await PublicKey.findProgramAddress(
      [Buffer.from("wumbo", "utf-8"), wumMint!.toBuffer()],
      programId
    );
    
    instructions.push(
      await this.instruction.initializeWumbo(
        {
          bumpSeed: wumboBump,
          tokenMetadataDefaults: {
            symbol: "UNCLAIMED",
            uri: "https://wumbo-token-metadata.s3.us-east-2.amazonaws.com/unclaimed.json",
            sellerFeeBasisPoints: 0,
            creators: null,
          },
          tokenBondingDefaults: {
            curve,
            baseRoyaltyPercentage: percent(5),
            targetRoyaltyPercentage: percent(5),
            targetMintDecimals: 9,
            buyFrozen: false
          },
          tokenStakingDefaults: {
            periodUnit: PeriodUnit.DAY,
            period: 1,
            targetMintDecimals: 9,
            rewardPercentPerPeriodPerLockupPeriod: percent(1)
          },
        },
        {
          accounts: {
            wumbo,
            mint: wumMint!,
            curve,
            payer,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          },
        }
      )
    );

    return {
      output: { wumbo },
      instructions,
      signers,
    };
  }

  async createWumbo(args: CreateWumboArgs): Promise<PublicKey> {
    const {
      output: { wumbo },
      instructions,
      signers,
    } = await this.createWumboInstructions(args);
    await this.sendInstructions(instructions, signers);

    return wumbo;
  }

  async claimSocialTokenInstructions({
    payer = this.wallet.publicKey,
    owner = this.wallet.publicKey,
    tokenRef
  }: ClaimSocialTokenArgs): Promise<InstructionResult<null>> {
    const tokenRefAcct = await this.account.tokenRefV0.fetch(tokenRef);
    const tokenBondingAcct = await this.splTokenBondingProgram.account.tokenBondingV0.fetch(tokenRefAcct.tokenBonding);
    const name = tokenRefAcct.name! as PublicKey;
    const instructions = [];

    const newTargetRoyalties = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      tokenBondingAcct.targetMint,
      owner,
      true
    );

    if (!(await this.splTokenBondingProgram.accountExists(newTargetRoyalties))) {
      console.log("Creating target royalties...");
      instructions.push(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          tokenBondingAcct.targetMint,
          newTargetRoyalties,
          owner,
          payer
        )
      );
    }

    const [reverseTokenRef] = await PublicKey.findProgramAddress(
      [Buffer.from("reverse-token-ref", "utf-8"), tokenRefAcct.wumbo.toBuffer(), tokenBondingAcct.targetMint.toBuffer()],
      this.programId
    );

    const targetRoyaltiesOwner = await PublicKey.createProgramAddress(
      [Buffer.from("target-royalties-owner", "utf-8"), tokenRef.toBuffer(), new BN(tokenRefAcct.targetRoyaltiesOwnerBumpSeed).toBuffer()],
      this.programId
    );

    const tokenBondingAuthority =
      await PublicKey.createProgramAddress(
        [Buffer.from("token-bonding-authority", "utf-8"), tokenRef.toBuffer(), new BN(tokenRefAcct.tokenBondingAuthorityBumpSeed).toBuffer()],
        this.programId
      );

    instructions.push(await this.instruction.claimSocialTokenV0({
      accounts: {
        wumbo: tokenRefAcct.wumbo,
        tokenRef: tokenRef,
        reverseTokenRef,
        tokenBonding: tokenRefAcct.tokenBonding,
        tokenBondingAuthority,
        targetRoyaltiesOwner,
        name,
        owner,
        newTargetRoyalties,
        targetRoyalties: tokenBondingAcct.targetRoyalties,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenBondingProgram: this.splTokenBondingProgram.programId
      }
    }))

    return {
      signers: [],
      instructions,
      output: null
    }
  }

  async claimSocialToken(args: ClaimSocialTokenArgs): Promise<void> {
    const {
      instructions,
      signers,
    } = await this.claimSocialTokenInstructions(args);
    await this.sendInstructions(instructions, signers);
  }

  async updateMetadataInstructions({
    tokenRef,
    name,
    symbol,
    uri
  }: UpdateMetadataArgs): Promise<InstructionResult<null>> {
    const tokenRefAcct = await this.account.tokenRefV0.fetch(tokenRef);
    const tokenMetadataRaw = await this.provider.connection.getAccountInfo(tokenRefAcct.tokenMetadata);
    const tokenMetadata = decodeMetadata(tokenMetadataRaw!.data);

    const tokenMetadataUpdateAuthority =
      await PublicKey.createProgramAddress(
        [Buffer.from("token-metadata-authority", "utf-8"), tokenRef.toBuffer(), new BN(tokenRefAcct.tokenMetadataUpdateAuthorityBumpSeed).toBuffer()],
        this.programId
      );

    return {
      signers: [],
      instructions: [
        await this.instruction.updateTokenMetadata({
          name: name || tokenMetadata.data.name,
          symbol: symbol || tokenMetadata.data.symbol,
          uri: uri || tokenMetadata.data.uri
        }, {
          accounts: {
            tokenRef,
            owner: tokenRefAcct.owner! as PublicKey,
            tokenMetadata: tokenRefAcct.tokenMetadata,
            updateAuthority: tokenMetadataUpdateAuthority,
            tokenMetadataProgram: METADATA_PROGRAM_ID
          }
        })
      ],
      output: null
    }
  }


  async updateMetadata(args: UpdateMetadataArgs): Promise<void> {
    const {
      instructions,
      signers,
    } = await this.updateMetadataInstructions(args);
    await this.sendInstructions(instructions, signers);
  }

  /*
  STAKING STUFF, will need later:
      // Create staking
    const [tokenStakingAuthority, tokenStakingAuthorityBumpSeed] =
      await PublicKey.findProgramAddress(
        [Buffer.from("token-staking-authority", "utf-8"), tokenRef.toBuffer()],
        programId
      );

    const {
      output: { tokenStaking, targetMint: stakingTargetMint },
      instructions: tokenStakingInstructions,
      signers: tokenStakingSigners,
    } = await this.splTokenStakingProgram.createTokenStakingInstructions({
      payer,
      authority: tokenStakingAuthority,
      baseMint: targetMint,
      periodUnit: wumboAcct.tokenStakingDefaults.periodUnit,
      period: wumboAcct.tokenStakingDefaults.period,
      targetMintDecimals: wumboAcct.tokenStakingDefaults.targetMintDecimals,
      rewardPercentPerPeriodPerLockupPeriod:
        wumboAcct.tokenStakingDefaults.rewardPercentPerPeriodPerLockupPeriod,
    });
    signers.push(...tokenStakingSigners);
    instructions.push(...tokenStakingInstructions);

    // Create split
    const { instructions: splitInstructions, signers: splitSigners, output: { tokenAccount: splitTarget, tokenAccountSplit } } =  await this.splTokenAccountSplitProgram.createTokenAccountSplitInstructions({
      payer,
      tokenStaking,
      mint: stakingTargetMint
    });
    signers.push(...splitSigners);
    instructions.push(...splitInstructions);

  */

  async createSocialTokenInstructions({
    payer = this.wallet.publicKey,
    wumbo,
    name,
    owner,
    tokenName: handle
  }: CreateSocialTokenArgs): Promise<
    BigInstructionResult<{
      tokenRef: PublicKey;
      reverseTokenRef: PublicKey;
    }>
  > {
    const programId = this.programId;
    const provider = this.provider;
    const instructions1: TransactionInstruction[] = [];
    const signers1: Signer[] = [];

    const wumboAcct = await this.program.account.wumbo.fetch(wumbo);

    // Token refs
    const [tokenRef, tokenRefBumpSeed] = await PublicKey.findProgramAddress(
      [Buffer.from("token-ref", "utf-8"), (name || owner)!.toBuffer()],
      programId
    );

    // create mint with payer as auth
    console.log("Creating social token mint...");
    const targetMintKeypair = anchor.web3.Keypair.generate();
    signers1.push(targetMintKeypair);
    const targetMint = targetMintKeypair.publicKey;

    instructions1.push(...(await createMintInstructions(provider, payer, targetMint, 9)));

    // create metadata with payer as temporary authority
    console.log("Creating social token metadata...");
    const [tokenMetadataUpdateAuthority, tokenMetadataUpdateAuthorityBumpSeed] =
      await PublicKey.findProgramAddress(
        [Buffer.from("token-metadata-authority", "utf-8"), tokenRef.toBuffer()],
        programId
      );
    const tokenMetadata = await createMetadata(
      new Data({
        symbol: wumboAcct.tokenMetadataDefaults.symbol as string,
        name: handle,
        uri: wumboAcct.tokenMetadataDefaults.uri as string,
        sellerFeeBasisPoints: 0,
        // @ts-ignore
        creators: null,
      }),
      tokenMetadataUpdateAuthority.toBase58(),
      targetMint.toBase58(),
      payer.toBase58(),
      instructions1,
      payer.toBase58()
    );

    // Set mint authority to token bondings authority
    const [targetMintAuthority, targetMintAuthorityBumpSeed] = await PublicKey.findProgramAddress(
      [Buffer.from("target-authority", "utf-8"), targetMint.toBuffer()],
      this.splTokenBondingProgram.programId
    );
    instructions1.push(Token.createSetAuthorityInstruction(
      TOKEN_PROGRAM_ID,
      targetMint,
      targetMintAuthority,
      "MintTokens",
      payer,
      []
    ))

    const [tokenBondingAuthority, tokenBondingAuthorityBumpSeed] =
      await PublicKey.findProgramAddress(
        [Buffer.from("token-bonding-authority", "utf-8"), tokenRef.toBuffer()],
        programId
      );

    // Create token bonding
    const instructions2: TransactionInstruction[] = [];
    const signers2: Signer[] = [];
    const [targetRoyaltiesPdaOwner, targetRoyaltiesOwnerBumpSeed] = await PublicKey.findProgramAddress(
      [Buffer.from("target-royalties-owner", "utf-8"), tokenRef.toBuffer()],
      programId
    );
    const [baseRoyaltiesPdaOwner, baseRoyaltiesOwnerBumpSeed] = await PublicKey.findProgramAddress(
      [Buffer.from("base-royalties-owner", "utf-8"), tokenRef.toBuffer()],
      programId
    );
    const { instructions: bondingInstructions, signers: bondingSigners, output: { tokenBonding, baseRoyalties, targetRoyalties } } = await this.splTokenBondingProgram.createTokenBondingInstructions({
      payer,
      curve: wumboAcct.tokenBondingDefaults.curve,
      baseMint: wumboAcct.mint,
      targetMint,
      authority: tokenBondingAuthority,
      baseRoyaltyPercentage: wumboAcct.tokenBondingDefaults.baseRoyaltyPercentage,
      targetRoyaltyPercentage: wumboAcct.tokenBondingDefaults.targetRoyaltyPercentage,
      baseRoyaltiesOwner: baseRoyaltiesPdaOwner,
      targetRoyaltiesOwner: owner || targetRoyaltiesPdaOwner
    });
    instructions2.push(...bondingInstructions);
    signers2.push(...bondingSigners);


    const [reverseTokenRef, reverseTokenRefBumpSeed] =
      await PublicKey.findProgramAddress(
        [Buffer.from("reverse-token-ref", "utf-8"), wumbo.toBuffer(), targetMint.toBuffer()],
        programId
      );

    const initializeArgs = {
      wumbo,
      tokenMetadata: new PublicKey(tokenMetadata),
      tokenBonding,
      baseRoyalties,
      targetRoyalties,
      targetMint,
      payer,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      clock: SYSVAR_CLOCK_PUBKEY
    }
    const args = {
      wumboBumpSeed: wumboAcct.bumpSeed,
      targetRoyaltiesOwnerBumpSeed,
      baseRoyaltiesOwnerBumpSeed,
      tokenBondingAuthorityBumpSeed,
      tokenRefBumpSeed,
      reverseTokenRefBumpSeed,
      tokenMetadataUpdateAuthorityBumpSeed,
    }

    if (owner) {
      instructions2.push(
        await this.instruction.initializeOwnedSocialTokenV0(
          args,
          {
            accounts: {
              initializeArgs,
              owner,
              payer,
              tokenRef,
              reverseTokenRef,
              systemProgram: SystemProgram.programId,
              rent: SYSVAR_RENT_PUBKEY,
            },
          }
        )
      );
    } else {
      instructions2.push(
        await this.instruction.initializeUnclaimedSocialTokenV0(
          args,
          {
            accounts: {
              initializeArgs,
              name: name!,
              payer,
              tokenRef,
              reverseTokenRef,
              systemProgram: SystemProgram.programId,
              rent: SYSVAR_RENT_PUBKEY,
            },
          }
        )
      ); 
    }

    return {
      output: { tokenRef, reverseTokenRef },
      instructions: [instructions1, instructions2],
      signers: [signers1, signers2],
    };
  }

  async createSocialToken(args: CreateSocialTokenArgs): Promise<{
    tokenRef: PublicKey;
    reverseTokenRef: PublicKey;
  }> {
    const {
      output: { tokenRef, reverseTokenRef },
      instructions,
      signers,
    } = await this.createSocialTokenInstructions(args);
    const txs = instructions.map((instructions, index) => {
      const tx = new Transaction();
      tx.add(...instructions);
      return {
        tx,
        signers: signers[index]
      }
    });
    await this.provider.sendAll(txs)

    return { tokenRef, reverseTokenRef };
  }
}