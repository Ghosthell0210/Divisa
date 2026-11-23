export type CurrencyCode = 'USD' | 'EUR' | 'MLC' | 'ZELLE' | 'CAD' | 'MXN' | 'CLASICA' | 'CUP';

export type CryptoSymbol = 'BTC' | 'ETH' | 'USDT' | 'SOL' | 'BNB' | 'TON';

export type DataSourceMode = 'live' | 'cached' | 'manual' | 'fallback';

export type TimeRange = '24H' | '7D' | '30D';

export interface FiatRate {
  code: Exclude<CurrencyCode, 'CUP'>;
  name: string;
  rateToCup: number;
  change24h: number;
  source: DataSourceMode;
  manualOverride?: number | null;
  isManualActive?: boolean;
}

export interface CryptoAsset {
  symbol: CryptoSymbol;
  name: string;
  priceUsd: number;
  priceCup: number;
  change24h: number;
  volume24hUsd: number;
  marketCapUsd: number;
  source: DataSourceMode;
}

export interface RemittanceGateway {
  id: string;
  name: string;
  method: string;
  feePercent: number;
  fixedFeeUsd: number;
  spreadCup: number;
  deliveryTime: string;
  payoutCurrency: 'CUP' | 'MLC' | 'USD';
  enabled: boolean;
}

export interface MarketSnapshot {
  updatedAt: string;
  elToqueUpdatedAt: string;
  cryptoUpdatedAt: string;
  elToqueSource: DataSourceMode;
  cryptoSource: DataSourceMode;
  fiatRates: FiatRate[];
  cryptoAssets: CryptoAsset[];
  cacheAgeSeconds: number;
}

export interface HistoricalPoint {
  label: string;
  timestamp: string;
  value: number;
  secondaryValue?: number;
}

export interface BotCommandLog {
  id: string;
  timestamp: string;
  origin: 'telegram' | 'simulator';
  username: string;
  command: string;
  responsePreview: string;
  latencyMs: number;
}

export interface BotRuntimeStatus {
  mode: 'polling' | 'webhook' | 'standby';
  hasToken: boolean;
  botUsername: string | null;
  startedAt: string;
  lastError: string | null;
}

export interface BotStats {
  runtime: BotRuntimeStatus;
  totalQueries: number;
  uniqueUsers: number;
  commandCounts: Record<string, number>;
  recentLogs: BotCommandLog[];
  gateways: RemittanceGateway[];
  manualModeEnabled: boolean;
}

export interface BotInlineButton {
  text: string;
  callbackData: string;
}

export interface BotSimulatedReply {
  text: string;
  buttons: BotInlineButton[][];
  latencyMs: number;
  commandUsed: string;
}
