import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "not-found";

  if (id === "not-found") {
    return NextResponse.json(
      { 
        success: false, 
        vaultId: '', 
        tweet: null,
        message: "Vault not found",
        errorCode: 'VAULT_NOT_FOUND'
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    vaultId: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9',
    tweet: {
      id: '1754645898637123456',
      text: 'ETH, CV, WBTC are the top assets by far in my portfolio. Im a ETH maxi, CV is my favorite project, and you gotta have BTC in your portfolio.',
      author: {
        id: '44196397',
        username: 'cryptotrader',
        name: 'Crypto Trader'
      },
      created_at: '2024-02-07T12:00:00Z',
      url: 'https://twitter.com/cryptotrader/status/1754645898637123456'
    },
    parsedAssets: [
      { asset: 'ETH', contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', share: 40 },
      { asset: 'CV', contractAddress: '0x4e3FBD56CDFD913F498b725718897F596B5E008E', share: 35 },
      { asset: 'WBTC', contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', share: 25 }
    ],
    createdAt: '2024-02-08T12:00:00Z'
  });
}
