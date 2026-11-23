export type CurrencyCode = 'USD' | 'EUR' | 'MLC' | 'ZELLE' | 'CAD' | 'MXN' | 'CLASICA' | 'CUP';

export type CryptoSymbol = 'BTC' | 'ETH' | 'USDT' | 'SOL' | 'BNB' | 'TON';

export type DataSourceMode =
  | 'live'
  | 'search-grounded'
  | 'cached'
  | 'stale'
  | 'manual'
  | 'unavailable';

export type TimeRange = '24H' | '7D' | '30D';

export interface SourceLink {
  title: string;
  uri: string;
}

export interface FiatRate {
  code: Exclude<CurrencyCode, 'CUP'>;
  name: string;
  rateToCup: number;
  change24h: number | null;
  source: DataSourceMode;
  manualOverride?: number | null;
  isManualActive?: boolean;
}

export interface CryptoAsset {
  symbol: CryptoSymbol;
  name: string;
  priceUsd: number;
  priceCup: number | null;
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
  elToqueUpdatedAt: string | null;
  cryptoUpdatedAt: string | null;
  elToqueSource: DataSourceMode;
  cryptoSource: DataSourceMode;
  elToqueError?: string | null;
  cryptoError?: string | null;
  sourceUrls?: SourceLink[];
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

export interface HistoricalSeriesResponse {
  symbol: string;
  range: TimeRange;
  points: HistoricalPoint[];
  source: DataSourceMode;
  message?: string;
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
