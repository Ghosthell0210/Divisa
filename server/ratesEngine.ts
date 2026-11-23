import fs from 'node:fs';
import path from 'node:path';
import type {
  BotCommandLog,
  BotStats,
  CryptoAsset,
  CryptoSymbol,
  DataSourceMode,
  FiatRate,
  HistoricalPoint,
  MarketSnapshot,
  RemittanceGateway,
  TimeRange,
} from '../src/types/market.ts';

interface PersistedState {
  manualModeEnabled: boolean;
  manualOverrides: Record<string, number | null>;
  gateways: RemittanceGateway[];
  totalQueries: number;
  seenUsers: string[];
  commandCounts: Record<string, number>;
  recentLogs: BotCommandLog[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'bot-state.json');

const DEFAULT_GATEWAYS: RemittanceGateway[] = [
  {
    id: 'binance-pay',
    name: 'Binance Pay / USDT TRC20',
    method: 'Cripto P2P',
    feePercent: 0.5,
    fixedFeeUsd: 1.0,
    spreadCup: 2,
    deliveryTime: '5 - 15 min',
    payoutCurrency: 'CUP',
    enabled: true,
  },
  {
    id: 'zelle',
    name: 'Zelle Directo',
    method: 'Transferencia USD',
    feePercent: 2.5,
    fixedFeeUsd: 0,
    spreadCup: 5,
    deliveryTime: '15 - 45 min',
    payoutCurrency: 'CUP',
    enabled: true,
  },
  {
    id: 'tropipay',
    name: 'TropiPay',
    method: 'Billetera EUR/USD',
    feePercent: 3.2,
    fixedFeeUsd: 1.5,
    spreadCup: 6,
    deliveryTime: '10 - 30 min',
    payoutCurrency: 'CUP',
    enabled: true,
  },
  {
    id: 'bizum',
    name: 'Bizum España',
    method: 'EUR Instantáneo',
    feePercent: 3.0,
    fixedFeeUsd: 0,
    spreadCup: 8,
    deliveryTime: '20 - 60 min',
    payoutCurrency: 'CUP',
    enabled: true,
  },
  {
    id: 'mlc-direct',
    name: 'Recarga Tarjeta MLC',
    method: 'Depósito Bancario',
    feePercent: 4.5,
    fixedFeeUsd: 2.0,
    spreadCup: 0,
    deliveryTime: '1 - 4 horas',
    payoutCurrency: 'MLC',
    enabled: true,
  },
];

const DEFAULT_FIAT_BASE: Array<{
  code: FiatRate['code'];
  name: string;
  rateToCup: number;
  change24h: number;
}> = [
  { code: 'USD', name: 'Dólar Estadounidense', rateToCup: 328, change24h: 0.61 },
  { code: 'EUR', name: 'Euro', rateToCup: 345, change24h: 0.29 },
  { code: 'MLC', name: 'Moneda Libremente Convertible', rateToCup: 265, change24h: -0.38 },
  { code: 'ZELLE', name: 'Saldo Zelle USD', rateToCup: 325, change24h: 0.31 },
  { code: 'CAD', name: 'Dólar Canadiense', rateToCup: 230, change24h: 0.0 },
  { code: 'MXN', name: 'Peso Mexicano', rateToCup: 16.5, change24h: -0.6 },
  { code: 'CLASICA', name: 'Tarjeta Clásica USD', rateToCup: 318, change24h: 0.45 },
];

const DEFAULT_CRYPTO_BASE: Array<{
  symbol: CryptoSymbol;
  name: string;
  priceUsd: number;
  change24h: number;
  volume24hUsd: number;
  marketCapUsd: number;
}> = [
  { symbol: 'BTC', name: 'Bitcoin', priceUsd: 94250, change24h: 2.14, volume24hUsd: 42800000000, marketCapUsd: 1865000000000 },
  { symbol: 'ETH', name: 'Ethereum', priceUsd: 3320, change24h: 1.48, volume24hUsd: 19400000000, marketCapUsd: 399000000000 },
  { symbol: 'USDT', name: 'Tether USD', priceUsd: 1.0, change24h: 0.01, volume24hUsd: 78500000000, marketCapUsd: 134000000000 },
  { symbol: 'SOL', name: 'Solana', priceUsd: 214.6, change24h: 3.72, volume24hUsd: 6200000000, marketCapUsd: 102000000000 },
  { symbol: 'BNB', name: 'BNB', priceUsd: 638.4, change24h: -0.54, volume24hUsd: 2100000000, marketCapUsd: 92400000000 },
  { symbol: 'TON', name: 'Toncoin', priceUsd: 5.62, change24h: 1.95, volume24hUsd: 390000000, marketCapUsd: 14300000000 },
];

function loadState(): PersistedState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        manualModeEnabled: Boolean(parsed.manualModeEnabled),
        manualOverrides: parsed.manualOverrides ?? {},
        gateways: Array.isArray(parsed.gateways) && parsed.gateways.length > 0 ? parsed.gateways : DEFAULT_GATEWAYS,
        totalQueries: Number(parsed.totalQueries ?? 0),
        seenUsers: Array.isArray(parsed.seenUsers) ? parsed.seenUsers : [],
        commandCounts: parsed.commandCounts ?? {},
        recentLogs: Array.isArray(parsed.recentLogs) ? parsed.recentLogs.slice(0, 40) : [],
      };
    }
  } catch {
    // Ignore corrupt state file and reinitialize cleanly
  }
  return {
    manualModeEnabled: false,
    manualOverrides: {},
    gateways: DEFAULT_GATEWAYS,
    totalQueries: 0,
    seenUsers: [],
    commandCounts: {},
    recentLogs: [],
  };
}

let state: PersistedState = loadState();

function persistState(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmp, STATE_FILE);
  } catch {
    // Non-fatal in read-only environments
  }
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  source: DataSourceMode;
}

let fiatCache: CacheEntry<Array<{ code: FiatRate['code']; rateToCup: number; change24h: number }>> | null = null;
let cryptoCache: CacheEntry<Array<{ symbol: CryptoSymbol; priceUsd: number; change24h: number; volume24hUsd: number; marketCapUsd: number }>> | null = null;

const FIAT_TTL_MS = 15 * 60 * 1000; // 15 minutes for El Toque
const CRYPTO_TTL_MS = 3 * 60 * 1000; // 3 minutes for Binance / CoinGecko

async function fetchWithTimeout(url: string, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CambioCubanoBot/1.0 (+https://eltoque.com)',
        Accept: 'application/json, text/html;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveElToqueRates(): Promise<{
  rates: Array<{ code: FiatRate['code']; rateToCup: number; change24h: number }>;
  source: DataSourceMode;
}> {
  // Attempt 1: Public El Toque webpage __NEXT_DATA__ extraction or JSON endpoint
  const candidateUrls = [
    'https://eltoque.com/tasas-de-cambio-de-moneda-en-cuba-hoy',
    'https://tasas.eltoque.com/v1/trmi',
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetchWithTimeout(url, 4000);
      if (!res.ok) continue;
      const text = await res.text();

      // Try direct JSON response
      if (text.trim().startsWith('{')) {
        const json = JSON.parse(text) as Record<string, unknown>;
        const tasas = (json.tasas as Record<string, number> | undefined) ?? (json as Record<string, number>);
        if (tasas && typeof tasas.USD === 'number' && tasas.USD > 50) {
          return {
            source: 'live',
            rates: DEFAULT_FIAT_BASE.map((base) => {
              const liveVal =
                base.code === 'USD'
                  ? tasas.USD
                  : base.code === 'EUR'
                    ? tasas.EUR
                    : base.code === 'MLC'
                      ? tasas.MLC
                      : base.code === 'CAD'
                        ? tasas.CAD
                        : undefined;
              return {
                code: base.code,
                rateToCup: typeof liveVal === 'number' && liveVal > 0 ? Number(liveVal.toFixed(2)) : base.rateToCup,
                change24h: base.change24h,
              };
            }),
          };
        }
      }

      // Try extracting Next.js embedded rates from El Toque HTML
      const usdMatch = text.match(/"USD"\s*:\s*(\d{2,4}(?:\.\d+)?)/);
      const eurMatch = text.match(/"EUR"\s*:\s*(\d{2,4}(?:\.\d+)?)/);
      const mlcMatch = text.match(/"MLC"\s*:\s*(\d{2,4}(?:\.\d+)?)/);

      if (usdMatch && Number(usdMatch[1]) > 100) {
        const usd = Number(usdMatch[1]);
        const eur = eurMatch ? Number(eurMatch[1]) : Math.round(usd * 1.05);
        const mlc = mlcMatch ? Number(mlcMatch[1]) : Math.round(usd * 0.81);
        return {
          source: 'live',
          rates: DEFAULT_FIAT_BASE.map((base) => {
            let val = base.rateToCup;
            if (base.code === 'USD') val = usd;
            else if (base.code === 'EUR') val = eur;
            else if (base.code === 'MLC') val = mlc;
            else if (base.code === 'ZELLE') val = Math.max(usd - 3, 1);
            else if (base.code === 'CLASICA') val = Math.max(usd - 10, 1);
            return {
              code: base.code,
              rateToCup: Number(val.toFixed(2)),
              change24h: base.change24h,
            };
          }),
        };
      }
    } catch {
      // Continue to next source or fallback
    }
  }

  return {
    source: 'fallback',
    rates: DEFAULT_FIAT_BASE.map((r) => ({
      code: r.code,
      rateToCup: r.rateToCup,
      change24h: r.change24h,
    })),
  };
}

async function fetchLiveCryptoRates(): Promise<{
  assets: Array<{ symbol: CryptoSymbol; priceUsd: number; change24h: number; volume24hUsd: number; marketCapUsd: number }>;
  source: DataSourceMode;
}> {
  // Attempt 1: CoinGecko markets endpoint (rich market cap + 24h volume + 24h change)
  try {
    const cgUrl =
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,tether,solana,binancecoin,the-open-network&order=market_cap_desc&sparkline=false&price_change_percentage=24h';
    const res = await fetchWithTimeout(cgUrl, 4500);
    if (res.ok) {
      const items = (await res.json()) as Array<{
        symbol: string;
        current_price: number;
        price_change_percentage_24h: number;
        total_volume: number;
        market_cap: number;
      }>;
      if (Array.isArray(items) && items.length >= 4) {
        const bySymbol = new Map(items.map((item) => [item.symbol.toUpperCase(), item]));
        return {
          source: 'live',
          assets: DEFAULT_CRYPTO_BASE.map((base) => {
            const match = bySymbol.get(base.symbol);
            return {
              symbol: base.symbol,
              priceUsd: match?.current_price ?? base.priceUsd,
              change24h: Number((match?.price_change_percentage_24h ?? base.change24h).toFixed(2)),
              volume24hUsd: match?.total_volume ?? base.volume24hUsd,
              marketCapUsd: match?.market_cap ?? base.marketCapUsd,
            };
          }),
        };
      }
    }
  } catch {
    // Fallback to Binance public ticker
  }

  // Attempt 2: Binance 24hr Ticker
  try {
    const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'TONUSDT'];
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`;
    const res = await fetchWithTimeout(url, 4000);
    if (res.ok) {
      const tickers = (await res.json()) as Array<{
        symbol: string;
        lastPrice: string;
        priceChangePercent: string;
        quoteVolume: string;
      }>;
      if (Array.isArray(tickers) && tickers.length > 0) {
        const map = new Map(tickers.map((t) => [t.symbol.replace('USDT', ''), t]));
        return {
          source: 'live',
          assets: DEFAULT_CRYPTO_BASE.map((base) => {
            if (base.symbol === 'USDT') return { ...base };
            const t = map.get(base.symbol);
            return {
              symbol: base.symbol,
              priceUsd: t ? Number(t.lastPrice) : base.priceUsd,
              change24h: t ? Number(Number(t.priceChangePercent).toFixed(2)) : base.change24h,
              volume24hUsd: t ? Number(t.quoteVolume) : base.volume24hUsd,
              marketCapUsd: base.marketCapUsd,
            };
          }),
        };
      }
    }
  } catch {
    // Fallback to deterministic baseline
  }

  return {
    source: 'fallback',
    assets: DEFAULT_CRYPTO_BASE.map((c) => ({
      symbol: c.symbol,
      priceUsd: c.priceUsd,
      change24h: c.change24h,
      volume24hUsd: c.volume24hUsd,
      marketCapUsd: c.marketCapUsd,
    })),
  };
}

export async function getMarketSnapshot(forceRefresh = false): Promise<MarketSnapshot> {
  const now = Date.now();

  if (forceRefresh || !fiatCache || now - fiatCache.fetchedAt > FIAT_TTL_MS) {
    const liveFiat = await fetchLiveElToqueRates();
    fiatCache = {
      data: liveFiat.rates,
      fetchedAt: now,
      source: liveFiat.source,
    };
  }

  if (forceRefresh || !cryptoCache || now - cryptoCache.fetchedAt > CRYPTO_TTL_MS) {
    const liveCrypto = await fetchLiveCryptoRates();
    cryptoCache = {
      data: liveCrypto.assets,
      fetchedAt: now,
      source: liveCrypto.source,
    };
  }

  const fiatSource: DataSourceMode = state.manualModeEnabled
    ? 'manual'
    : now - fiatCache.fetchedAt < 60_000 || fiatCache.source === 'live'
      ? fiatCache.source
      : 'cached';

  const fiatRates: FiatRate[] = DEFAULT_FIAT_BASE.map((base) => {
    const cachedItem = fiatCache!.data.find((d) => d.code === base.code);
    const override = state.manualOverrides[base.code] ?? null;
    const isManualActive = Boolean((state.manualModeEnabled || override !== null) && override && override > 0);
    const finalRate = isManualActive && override ? override : (cachedItem?.rateToCup ?? base.rateToCup);
    return {
      code: base.code,
      name: base.name,
      rateToCup: finalRate,
      change24h: cachedItem?.change24h ?? base.change24h,
      source: isManualActive ? 'manual' : fiatSource,
      manualOverride: override,
      isManualActive,
    };
  });

  const usdToCup = fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? 328;
  const cryptoSource: DataSourceMode =
    now - cryptoCache.fetchedAt < 60_000 || cryptoCache.source === 'live' ? cryptoCache.source : 'cached';

  const cryptoAssets: CryptoAsset[] = DEFAULT_CRYPTO_BASE.map((base) => {
    const item = cryptoCache!.data.find((c) => c.symbol === base.symbol);
    const priceUsd = item?.priceUsd ?? base.priceUsd;
    return {
      symbol: base.symbol,
      name: base.name,
      priceUsd,
      priceCup: Number((priceUsd * usdToCup).toFixed(2)),
      change24h: item?.change24h ?? base.change24h,
      volume24hUsd: item?.volume24hUsd ?? base.volume24hUsd,
      marketCapUsd: item?.marketCapUsd ?? base.marketCapUsd,
      source: cryptoSource,
    };
  });

  return {
    updatedAt: new Date(Math.max(fiatCache.fetchedAt, cryptoCache.fetchedAt)).toISOString(),
    elToqueUpdatedAt: new Date(fiatCache.fetchedAt).toISOString(),
    cryptoUpdatedAt: new Date(cryptoCache.fetchedAt).toISOString(),
    elToqueSource: fiatSource,
    cryptoSource,
    fiatRates,
    cryptoAssets,
    cacheAgeSeconds: Math.round((now - Math.min(fiatCache.fetchedAt, cryptoCache.fetchedAt)) / 1000),
  };
}

export async function getHistoricalSeries(symbol: string, range: TimeRange): Promise<HistoricalPoint[]> {
  const upper = symbol.toUpperCase();
  const snapshot = await getMarketSnapshot(false);

  const fiat = snapshot.fiatRates.find((f) => f.code === upper);
  const crypto = snapshot.cryptoAssets.find((c) => c.symbol === upper);

  // Try real CoinGecko historical chart for crypto assets
  const cgIdMap: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    USDT: 'tether',
    SOL: 'solana',
    BNB: 'binancecoin',
    TON: 'the-open-network',
  };

  if (crypto && cgIdMap[upper]) {
    const days = range === '24H' ? '1' : range === '7D' ? '7' : '30';
    try {
      const res = await fetchWithTimeout(
        `https://api.coingecko.com/api/v3/coins/${cgIdMap[upper]}/market_chart?vs_currency=usd&days=${days}`,
        4000
      );
      if (res.ok) {
        const json = (await res.json()) as { prices?: Array<[number, number]> };
        if (Array.isArray(json.prices) && json.prices.length > 4) {
          const step = Math.max(1, Math.floor(json.prices.length / 24));
          const sampled = json.prices.filter((_, idx) => idx % step === 0).slice(-24);
          const usdCup = snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? 328;
          return sampled.map(([ts, price]) => {
            const d = new Date(ts);
            const label =
              range === '24H'
                ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            return {
              label,
              timestamp: d.toISOString(),
              value: Number(price.toFixed(price < 10 ? 3 : 2)),
              secondaryValue: Number((price * usdCup).toFixed(0)),
            };
          });
        }
      }
    } catch {
      // Fall back to deterministic anchored curve
    }
  }

  const anchor = fiat ? fiat.rateToCup : crypto ? crypto.priceUsd : 328;
  const change = fiat ? fiat.change24h : crypto ? crypto.change24h : 0.5;
  const pointsCount = range === '24H' ? 24 : range === '7D' ? 14 : 30;
  const now = Date.now();
  const intervalMs = range === '24H' ? 3600_000 : range === '7D' ? 12 * 3600_000 : 24 * 3600_000;

  const volatility = upper === 'USDT' ? 0.002 : fiat ? 0.014 : 0.032;
  const seed = upper.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  const series: HistoricalPoint[] = [];
  for (let i = pointsCount - 1; i >= 0; i--) {
    const progress = (pointsCount - 1 - i) / Math.max(1, pointsCount - 1);
    const wave = Math.sin((i + seed) * 0.65) * volatility * 0.6 + Math.cos((i * 1.3 + seed) * 0.4) * volatility * 0.4;
    const trendOffset = (change / 100) * (progress - 1);
    const val = i === 0 ? anchor : anchor * (1 + trendOffset + wave);
    const ts = new Date(now - i * intervalMs);
    const label =
      range === '24H'
        ? ts.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : ts.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    series.push({
      label,
      timestamp: ts.toISOString(),
      value: Number(val.toFixed(val < 10 ? 3 : 2)),
    });
  }
  return series;
}

export async function convertCurrencies(
  amount: number,
  fromSymbol: string,
  toSymbol: string
): Promise<{
  amount: number;
  from: string;
  to: string;
  result: number;
  effectiveRate: number;
  usdValue: number;
  cupValue: number;
} | null> {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const snapshot = await getMarketSnapshot(false);
  const from = fromSymbol.toUpperCase();
  const to = toSymbol.toUpperCase();

  const usdToCup = snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? 328;

  const getValueInCup = (sym: string): number | null => {
    if (sym === 'CUP') return 1;
    const fiat = snapshot.fiatRates.find((f) => f.code === sym);
    if (fiat) return fiat.rateToCup;
    const crypto = snapshot.cryptoAssets.find((c) => c.symbol === sym);
    if (crypto) return crypto.priceUsd * usdToCup;
    return null;
  };

  const fromCup = getValueInCup(from);
  const toCup = getValueInCup(to);
  if (fromCup === null || toCup === null || toCup === 0) return null;

  const totalCup = amount * fromCup;
  const result = totalCup / toCup;
  const effectiveRate = fromCup / toCup;

  return {
    amount,
    from,
    to,
    result,
    effectiveRate,
    usdValue: totalCup / usdToCup,
    cupValue: totalCup,
  };
}

export async function calculateRemittances(amountUsd: number): Promise<
  Array<
    RemittanceGateway & {
      sendAmountUsd: number;
      feeUsd: number;
      netUsd: number;
      deliveredAmount: number;
      effectiveCupRate: number;
    }
  >
> {
  const snapshot = await getMarketSnapshot(false);
  const usdToCup = snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? 328;
  const mlcToCup = snapshot.fiatRates.find((f) => f.code === 'MLC')?.rateToCup ?? 265;

  return state.gateways
    .filter((g) => g.enabled)
    .map((gw) => {
      const feeUsd = Number(((amountUsd * gw.feePercent) / 100 + gw.fixedFeeUsd).toFixed(2));
      const netUsd = Math.max(0, amountUsd - feeUsd);
      let deliveredAmount = 0;
      let effectiveCupRate = 0;

      if (gw.payoutCurrency === 'CUP') {
        const appliedRate = Math.max(1, usdToCup - gw.spreadCup);
        deliveredAmount = Math.round(netUsd * appliedRate);
        effectiveCupRate = amountUsd > 0 ? Number((deliveredAmount / amountUsd).toFixed(2)) : 0;
      } else if (gw.payoutCurrency === 'MLC') {
        const mlcPerUsd = usdToCup / mlcToCup;
        deliveredAmount = Number((netUsd * mlcPerUsd).toFixed(2));
        effectiveCupRate = amountUsd > 0 ? Number(((deliveredAmount * mlcToCup) / amountUsd).toFixed(2)) : 0;
      } else {
        deliveredAmount = Number(netUsd.toFixed(2));
        effectiveCupRate = amountUsd > 0 ? Number(((netUsd * usdToCup) / amountUsd).toFixed(2)) : 0;
      }

      return {
        ...gw,
        sendAmountUsd: amountUsd,
        feeUsd,
        netUsd: Number(netUsd.toFixed(2)),
        deliveredAmount,
        effectiveCupRate,
      };
    });
}

export function recordBotInteraction(params: {
  origin: 'telegram' | 'simulator';
  userId: string;
  username: string;
  command: string;
  responsePreview: string;
  latencyMs: number;
}): void {
  state.totalQueries += 1;
  const cleanCmd = params.command.split(/\s+/)[0]?.toLowerCase() || '/start';
  state.commandCounts[cleanCmd] = (state.commandCounts[cleanCmd] ?? 0) + 1;
  if (!state.seenUsers.includes(params.userId)) {
    state.seenUsers.push(params.userId);
    if (state.seenUsers.length > 5000) {
      state.seenUsers.shift();
    }
  }
  const log: BotCommandLog = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    origin: params.origin,
    username: params.username,
    command: params.command,
    responsePreview: params.responsePreview.slice(0, 140),
    latencyMs: params.latencyMs,
  };
  state.recentLogs = [log, ...state.recentLogs].slice(0, 35);
  persistState();
}

export function updateManualOverrides(manualModeEnabled: boolean, overrides: Record<string, number | null>): void {
  state.manualModeEnabled = manualModeEnabled;
  state.manualOverrides = { ...state.manualOverrides, ...overrides };
  persistState();
}

export function updateGateways(gateways: RemittanceGateway[]): void {
  if (Array.isArray(gateways) && gateways.length > 0) {
    state.gateways = gateways;
    persistState();
  }
}

export function getAdminStateSnapshot(runtime: BotStats['runtime']): BotStats {
  return {
    runtime,
    totalQueries: state.totalQueries,
    uniqueUsers: state.seenUsers.length,
    commandCounts: { ...state.commandCounts },
    recentLogs: [...state.recentLogs],
    gateways: [...state.gateways],
    manualModeEnabled: state.manualModeEnabled,
  };
}
