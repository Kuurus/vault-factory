"use client";

import { fallback, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, WagmiProvider } from "@privy-io/wagmi";
import { PrivyClientConfig, PrivyProvider } from "@privy-io/react-auth";
import { Transport } from "viem";

const queryClient = new QueryClient();

const transport = fallback(
  [
    http(
      "https://base-sepolia.g.alchemy.com/v2/jYMuVKmmqubRmM_abl3wwvoVgth2qeVz"
    ),
    http("https://base-sepolia-rpc.publicnode.com"),
  ],
  {
    rank: true,
  }
) as Transport;

const config = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: transport,
  },
});

const privyConfig: PrivyClientConfig = {
  embeddedWallets: {
    createOnLogin: "users-without-wallets",
    requireUserPasswordOnCreate: true,
    showWalletUIs: true,
  },
  loginMethods: ["wallet", "email", "sms"],
  appearance: {
    showWalletLoginFirst: true,
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={privyConfig}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
