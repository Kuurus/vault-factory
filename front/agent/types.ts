export type Message = {
  user: string | null;
  agent: string | null;
  message: string;
  isInstruction?: boolean;
};


export interface CMCQuote {
  price: number;
  market_cap: number;
  volume_24h: number;
  percent_change_24h: number;
}

export interface Token {
  [key: string]: string;
}

export interface TokenData {
  [key: string]: CMCQuote;
}

export interface MarketData {
  tokenData: TokenData;
  tokenAddresses: Token;
}

export interface Asset {
  asset: string;
  share: number;
}

export interface ParsedAsset {
  asset: string;
  contractAddress: string;
  share: number;
}

export interface AnalysisResult {
  parsedAssets: ParsedAsset[];
}

export interface MarketData {
  tokenData: TokenData;
  tokenAddresses: Token;
}

export interface CMCPlatform {
  token_address: string;
}

export interface CMCData {
  quote: {
    USD: CMCQuote;
  };
  symbol: string;
  platform?: {
    ethereum?: CMCPlatform;
  };
}

export interface CMCResponse {
  data: CMCData[];
}