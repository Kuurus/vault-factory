"use server";
import { OpenAI } from "openai";
import "dotenv/config";
import { fetchCoingeckoData } from "./tokens/coinGecko";
import { AnalysisResult, Asset, TokenData } from "./types";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const systemPrompt = `Analyze the given text and suggest a crypto portfolio allocation.
Consider market conditions, risk factors, and investment thesis from the text.
Allocations must sum to 100% and only include tokens from the provided market data.`;

export const analyzeText = async (text: string): Promise<AnalysisResult> => {

    const { tokenData, tokenAddresses } = await fetchCoingeckoData();

    const marketContext = createMarketContext(tokenData);

    const completion = await openai.chat.completions.create({
        model: "gpt-4",
        temperature: 0.7,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `${marketContext}\n\nAnalyze this: ${text}` }
        ],
        tools: [createPortfolioTool(Object.keys(tokenAddresses))]
    });

    const toolCall = completion.choices[0].message.tool_calls?.[0];
    if (!toolCall) {
        throw new Error("No tool call found in response");
    }

    const args = JSON.parse(toolCall.function.arguments);
    validateAllocation(args.assets);

    return {
        parsedAssets: args.assets.map((item: Asset) => ({
            asset: item.asset,
            contractAddress: tokenAddresses[item.asset],
            share: item.share
        }))
    };

}

const createMarketContext = (tokenData: TokenData): string => {
    return `Current market data:\n${Object.entries(tokenData)
        .filter(([_, data]) =>
            data.price != null &&
            data.percent_change_24h != null &&
            data.market_cap != null
        )
        .map(([token, data]) =>
            `${token}: $${data.price?.toFixed(2) || '0.00'}, ` +
            `24h change: ${data.percent_change_24h?.toFixed(2) || '0.00'}%, ` +
            `Market Cap: $${((data.market_cap || 0) / 1e9).toFixed(2)}B`
        ).join('\n')}`;
}

const createPortfolioTool = (validTokens: string[]) => {
    return {
        type: "function",
        function: {
            name: "create_portfolio",
            description: "Creates portfolio allocation based on analysis",
            parameters: {
                type: "object",
                properties: {
                    assets: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                asset: {
                                    type: "string",
                                    enum: validTokens
                                },
                                share: {
                                    type: "number",
                                    minimum: 0,
                                    maximum: 100,
                                    description: "Percentage allocation"
                                }
                            },
                            required: ["asset", "share"]
                        },
                        description: "Array of assets and their allocations"
                    }
                },
                required: ["assets"]
            }
        }
    } as const;
}

const validateAllocation = (assets: Asset[]): void => {
    const totalShare = assets.reduce((sum, asset) => sum + asset.share, 0);
    if (Math.abs(totalShare - 100) > 0.01) {
        throw new Error(`Invalid allocation total: ${totalShare}%`);
    }
}