import { CMCData, CMCResponse, MarketData, Token, TokenData } from "../types";

export async function fetchCMCData(): Promise<MarketData> {

    const response = await fetch(
        'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?aux=platform',
        {
            headers: {
                'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY || '',
            },
        }
    );

    if (!response.ok) {
        throw new Error(`CMC API error: ${response.status}`);
    }

    const data: CMCResponse = await response.json();

    const tokenData: TokenData = {};
    const tokenAddresses: Token = {};

    data.data.forEach((coin: CMCData) => {
        if (coin.platform?.ethereum?.token_address) {
            tokenData[coin.symbol] = {
                price: coin.quote.USD.price,
                market_cap: coin.quote.USD.market_cap,
                volume_24h: coin.quote.USD.volume_24h,
                percent_change_24h: coin.quote.USD.percent_change_24h
            };
            tokenAddresses[coin.symbol] = coin.platform.ethereum.token_address;
        }
    });



    return { tokenData, tokenAddresses };

}