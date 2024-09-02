// @ts-nocheck
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { ReactNode, useMemo } from 'react';
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";
import { UmiContext } from './useUmi';

export const UmiProvider = ({ children }: { children: ReactNode }) => {
  const wallet = useWallet();
  const { connection } = useConnection();

  const umi = useMemo(() => {
    const u = createUmi(connection)
      .use(irysUploader())
      .use(mplToolbox());

    if (wallet.connected) {
      return u.use(walletAdapterIdentity(wallet));
    }
    return u;
  }, [wallet, connection]);

  return <UmiContext.Provider value={{ umi }}>{children}</UmiContext.Provider>;
};