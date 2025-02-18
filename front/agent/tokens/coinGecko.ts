
import { MarketData, Token, TokenData } from "../types";


export async function fetchCoingeckoData(): Promise<MarketData> {
    const tokensResponse = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
    const tokensList = await tokensResponse.json();

    const marketResponse = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?' +
        'vs_currency=usd&' +
        'order=market_cap_desc&' +
        'per_page=250&' +
        'page=1&' +
        'sparkline=false'
    );
    const marketData = await marketResponse.json();

    const tokenData: TokenData = {};
    const tokenAddresses: Token = {};

    marketData.forEach((coin: any) => {
        const tokenInfo = tokensList.find((t: any) => t.id === coin.id);
        if (tokenInfo?.platforms?.ethereum) {
            tokenData[coin.symbol.toUpperCase()] = {
                price: coin.current_price,
                market_cap: coin.market_cap,
                volume_24h: coin.total_volume,
                percent_change_24h: coin.price_change_percentage_24h
            };
            tokenAddresses[coin.symbol.toUpperCase()] = tokenInfo.platforms.ethereum.toLowerCase();
        }
    });



    return { tokenData, tokenAddresses };
}