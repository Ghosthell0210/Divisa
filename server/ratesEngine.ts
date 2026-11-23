import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  BotCommandLog,
  BotStats,
  CryptoAsset,
  CryptoSymbol,
  DataSourceMode,
  FiatRate,
  HistoricalPoint,
  HistoricalSeriesResponse,
  MarketSnapshot,
  RemittanceGateway,
  SourceLink,
  TimeRange,
} from '../src/types/market.ts';

interface StoredFiatItem {
  code: FiatRate['code'];
  rateToCup: number;
  change24h: number | null;
}

interface StoredCryptoItem {
  symbol: CryptoSymbol;
  priceUsd: number;
  change24h: number;
  volume24hUsd: number;
  marketCapUsd: number;
}

interface PersistedState {
  manualModeEnabled: boolean;
  manualOverrides: Record<string, number | null>;
  gateways: RemittanceGateway[];
  totalQueries: number;
  seenUsers: string[];
  commandCounts: Record<string, number>;
  recentLogs: BotCommandLog[];
  lastRealFiat?: {
    fetchedAt: string;
    source: DataSourceMode;
    sourceUrls: SourceLink[];
    rates: StoredFiatItem[];
  };
  lastRealCrypto?: {
    fetchedAt: string;
    source: DataSourceMode;
    assets: StoredCryptoItem[];
  };
  fiatHistory: Record<string, Array<{ timestamp: string; value: number }>>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'bot-state.json');

const FIAT_NAMES: Record<FiatRate['code'], string> = {
  USD: 'Dólar Estadounidense',
  EUR: 'Euro',
  MLC: 'Moneda Libremente Convertible',
  ZELLE: 'Saldo Zelle USD',
  CAD: 'Dólar Canadiense',
  MXN: 'Peso Mexicano',
  CLASICA: 'Tarjeta Clásica USD',
};

const CRYPTO_META: Array<{ symbol: CryptoSymbol; coingeckoId: string; name: string }> = [
  { symbol: 'BTC', coingeckoId: 'bitcoin', name: 'Bitcoin' },
  { symbol: 'ETH', coingeckoId: 'ethereum', name: 'Ethereum' },
  { symbol: 'USDT', coingeckoId: 'tether', name: 'Tether USD' },
  { symbol: 'SOL', coingeckoId: 'solana', name: 'Solana' },
  { symbol: 'BNB', coingeckoId: 'binancecoin', name: 'BNB' },
  { symbol: 'TON', coingeckoId: 'the-open-network', name: 'Toncoin' },
];

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
        lastRealFiat: parsed.lastRealFiat,
        lastRealCrypto: parsed.lastRealCrypto,
        fiatHistory: parsed.fiatHistory ?? {},
      };
    }
  } catch {
    // Reinitialize cleanly if file is corrupted
  }
  return {
    manualModeEnabled: false,
    manualOverrides: {},
    gateways: DEFAULT_GATEWAYS,
    totalQueries: 0,
    seenUsers: [],
    commandCounts: {},
    recentLogs: [],
    fiatHistory: {},
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
    // Non-fatal on read-only FS
  }
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  source: DataSourceMode;
  sourceUrls?: SourceLink[];
  error?: string | null;
}

let fiatCache: CacheEntry<StoredFiatItem[]> | null = null;
let cryptoCache: CacheEntry<StoredCryptoItem[]> | null = null;

const FIAT_TTL_MS = 10 * 60 * 1000; // 10 min
const CRYPTO_TTL_MS = 2 * 60 * 1000; // 2 min

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CambioCubanoBot/2.0)',
        Accept: 'application/json, text/html;q=0.9',
        ...(options.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function appendFiatHistory(rates: StoredFiatItem[], timestampIso: string): void {
  for (const item of rates) {
    const existing = state.fiatHistory[item.code] ?? [];
    const last = existing[existing.length - 1];
    const fiveMinMs = 5 * 60 * 1000;
    const isDuplicateWindow =
      last &&
      Date.now() - new Date(last.timestamp).getTime() < fiveMinMs &&
      Math.abs(last.value - item.rateToCup) < 0.01;
    if (!isDuplicateWindow) {
      existing.push({ timestamp: timestampIso, value: item.rateToCup });
      if (existing.length > 180) {
        existing.shift();
      }
      state.fiatHistory[item.code] = existing;
    }
  }
}

function parseElToqueTasasObject(raw: Record<string, unknown>): StoredFiatItem[] {
  const results: StoredFiatItem[] = [];
  const mapping: Array<{ keys: string[]; code: FiatRate['code'] }> = [
    { keys: ['USD', 'usd'], code: 'USD' },
    { keys: ['EUR', 'eur'], code: 'EUR' },
    { keys: ['MLC', 'mlc'], code: 'MLC' },
    { keys: ['ZELLE', 'zelle', 'Zelle'], code: 'ZELLE' },
    { keys: ['CAD', 'cad'], code: 'CAD' },
    { keys: ['MXN', 'mxn'], code: 'MXN' },
    { keys: ['CLASICA', 'clasica', 'Clasica', 'TARJETA_CLASICA'], code: 'CLASICA' },
  ];

  for (const entry of mapping) {
    for (const k of entry.keys) {
      const v = raw[k];
      const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
      if (Number.isFinite(num) && num > 1) {
        results.push({
          code: entry.code,
          rateToCup: Number(num.toFixed(2)),
          change24h: null,
        });
        break;
      }
    }
  }
  return results;
}

async function fetchElToqueViaSearchGrounding(): Promise<{
  rates: StoredFiatItem[];
  sourceUrls: SourceLink[];
} | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const prompt = `Busca en Google la tasa representativa del mercado informal de divisas en Cuba publicada hoy (${todayStr}) por elTOQUE (eltoque.com/tasas-de-cambio-de-moneda-en-cuba-hoy).
Extrae únicamente los valores numéricos reales actuales en CUP (Pesos Cubanos) publicados por elTOQUE para USD, EUR, MLC, ZELLE, CAD, MXN y CLASICA. Si alguno no aparece explícitamente en los resultados de búsqueda, devuelve null para ese campo. NO inventes ni estimes cifras.
Devuelve SOLO un bloque JSON válido con este formato exacto:
{
  "USD": number | null,
  "EUR": number | null,
  "MLC": number | null,
  "ZELLE": number | null,
  "CAD": number | null,
  "MXN": number | null,
  "CLASICA": number | null
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const rawText = response.text ?? '';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const rates = parseElToqueTasasObject(parsed);
  if (rates.length === 0) return null;

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sourceUrls: SourceLink[] = [];
  for (const chunk of chunks) {
    const web = (chunk as { web?: { uri?: string; title?: string } }).web;
    if (web?.uri) {
      sourceUrls.push({
        title: web.title ?? 'elTOQUE',
        uri: web.uri,
      });
    }
  }

  return { rates, sourceUrls: sourceUrls.slice(0, 4) };
}

function parseElToqueChannelPosts(html: string): Array<{
  dateIso: string;
  rates: StoredFiatItem[];
}> {
  const blocks = html.split('tgme_widget_message_text');
  const parsedPosts: Array<{ dateIso: string; rates: StoredFiatItem[] }> = [];

  for (const block of blocks) {
    if (!block.includes('Tasa representativa del mercado informal') && !block.includes('USD:')) continue;
    const clean = block
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ');

    const dateMatch = clean.match(/Fecha:\s*(\d{2})\/(\d{2})\/(\d{4})/);
    const dateIso = dateMatch
      ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T12:00:00.000Z`
      : new Date().toISOString();

    // Only capture the main rate block before "Hay ofertas en los rangos"
    const mainSection = clean.split(/Hay ofertas en los rangos/i)[0] ?? clean;
    const rates: StoredFiatItem[] = [];

    for (const code of ['USD', 'EUR', 'MLC', 'ZELLE', 'CAD', 'MXN', 'CLASICA'] as const) {
      const rx = new RegExp(`\\b${code}\\s*:\\s*(\\d{2,5}(?:[.,]\\d+)?)\\s*CUP`, 'i');
      const m = mainSection.match(rx);
      if (m) {
        const val = Number(m[1].replace(',', '.'));
        if (Number.isFinite(val) && val > 1) {
          rates.push({ code, rateToCup: Number(val.toFixed(2)), change24h: null });
        }
      }
    }

    if (rates.length > 0) {
      parsedPosts.push({ dateIso, rates });
    }
  }

  return parsedPosts;
}

async function fetchRealElToqueRates(): Promise<{
  rates: StoredFiatItem[];
  source: DataSourceMode;
  sourceUrls: SourceLink[];
  error: string | null;
}> {
  // 1. Official El Toque API if ELTOQUE_API_TOKEN is provided
  const elToqueToken = process.env.ELTOQUE_API_TOKEN?.trim();
  if (elToqueToken) {
    try {
      const res = await fetchWithTimeout('https://tasas.eltoque.com/v1/trmi', {
        headers: { Authorization: `Bearer ${elToqueToken}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { tasas?: Record<string, unknown> } & Record<string, unknown>;
        const rates = parseElToqueTasasObject(json.tasas ?? json);
        if (rates.length > 0) {
          const nowIso = new Date().toISOString();
          const urls = [{ title: 'API Oficial elTOQUE', uri: 'https://tasas.eltoque.com' }];
          state.lastRealFiat = { fetchedAt: nowIso, source: 'live', sourceUrls: urls, rates };
          appendFiatHistory(rates, nowIso);
          persistState();
          return { rates, source: 'live', sourceUrls: urls, error: null };
        }
      }
    } catch {
      // Fall through to public channel & Search Grounding
    }
  }

  // 2. Official elTOQUE public Telegram channel web preview (no Cloudflare, real daily TRMI)
  try {
    const res = await fetchWithTimeout('https://t.me/s/eltoquecom', {}, 5500);
    if (res.ok) {
      const html = await res.text();
      const posts = parseElToqueChannelPosts(html);
      if (posts.length > 0) {
        const latest = posts[posts.length - 1];
        const previous = posts.length >= 2 ? posts[posts.length - 2] : null;

        const ratesWithChange = latest.rates.map((item) => {
          const prevItem = previous?.rates.find((p) => p.code === item.code);
          const change24h =
            prevItem && prevItem.rateToCup > 0
              ? Number((((item.rateToCup - prevItem.rateToCup) / prevItem.rateToCup) * 100).toFixed(2))
              : null;
          return { ...item, change24h };
        });

        // Populate real historical points from the channel's published daily posts
        for (const post of posts) {
          for (const item of post.rates) {
            const list = state.fiatHistory[item.code] ?? [];
            const exists = list.some((p) => p.timestamp.slice(0, 10) === post.dateIso.slice(0, 10));
            if (!exists) {
              list.push({ timestamp: post.dateIso, value: item.rateToCup });
              list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
              if (list.length > 180) list.shift();
              state.fiatHistory[item.code] = list;
            }
          }
        }

        const nowIso = new Date().toISOString();
        const urls = [
          { title: 'Canal Oficial elTOQUE', uri: 'https://t.me/s/eltoquecom' },
          { title: 'elTOQUE Tasas', uri: 'https://eltoque.com/tasas-de-cambio-de-moneda-en-cuba-hoy' },
        ];
        state.lastRealFiat = { fetchedAt: nowIso, source: 'live', sourceUrls: urls, rates: ratesWithChange };
        persistState();
        return { rates: ratesWithChange, source: 'live', sourceUrls: urls, error: null };
      }
    }
  } catch {
    // Continue to direct HTML & Search Grounding
  }

  // 3. Direct HTML/JSON extraction from eltoque.com
  const publicUrls = [
    'https://eltoque.com/tasas-de-cambio-de-moneda-en-cuba-hoy',
    'https://cambio.eltoque.com',
  ];
  for (const url of publicUrls) {
    try {
      const res = await fetchWithTimeout(url, {}, 4500);
      if (!res.ok) continue;
      const html = await res.text();
      if (html.includes('cf-browser-verification') || html.includes('Just a moment')) continue;

      const extracted: Record<string, number> = {};
      for (const code of ['USD', 'EUR', 'MLC', 'CAD', 'MXN', 'ZELLE', 'CLASICA']) {
        const m = html.match(new RegExp(`"${code}"\\s*:\\s*(\\d{2,4}(?:\\.\\d+)?)`));
        if (m && Number(m[1]) > 5) {
          extracted[code] = Number(m[1]);
        }
      }
      const rates = parseElToqueTasasObject(extracted);
      if (rates.length >= 2) {
        const nowIso = new Date().toISOString();
        const urls = [{ title: 'elTOQUE', uri: url }];
        state.lastRealFiat = { fetchedAt: nowIso, source: 'live', sourceUrls: urls, rates };
        appendFiatHistory(rates, nowIso);
        persistState();
        return { rates, source: 'live', sourceUrls: urls, error: null };
      }
    } catch {
      // Continue to Search Grounding
    }
  }

  // 3. Live Google Search Grounding via Gemini (handles Cloudflare-protected eltoque.com reliably)
  try {
    const grounded = await fetchElToqueViaSearchGrounding();
    if (grounded && grounded.rates.length > 0) {
      const nowIso = new Date().toISOString();
      state.lastRealFiat = {
        fetchedAt: nowIso,
        source: 'search-grounded',
        sourceUrls: grounded.sourceUrls,
        rates: grounded.rates,
      };
      appendFiatHistory(grounded.rates, nowIso);
      persistState();
      return {
        rates: grounded.rates,
        source: 'search-grounded',
        sourceUrls: grounded.sourceUrls,
        error: null,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error en búsqueda en vivo';
    if (state.lastRealFiat && state.lastRealFiat.rates.length > 0) {
      return {
        rates: state.lastRealFiat.rates,
        source: 'stale',
        sourceUrls: state.lastRealFiat.sourceUrls,
        error: `Mostrando último dato real guardado (${new Date(state.lastRealFiat.fetchedAt).toLocaleString('es-ES')}): ${msg}`,
      };
    }
    return {
      rates: [],
      source: 'unavailable',
      sourceUrls: [],
      error: `No se pudieron obtener tasas reales de El Toque: ${msg}`,
    };
  }

  // 4. Last real persisted snapshot (stale) or explicit unavailable error — NEVER invent numbers
  if (state.lastRealFiat && state.lastRealFiat.rates.length > 0) {
    return {
      rates: state.lastRealFiat.rates,
      source: 'stale',
      sourceUrls: state.lastRealFiat.sourceUrls,
      error: `Fuente en vivo sin respuesta; mostrando último dato real guardado (${new Date(state.lastRealFiat.fetchedAt).toLocaleString('es-ES')}).`,
    };
  }

  return {
    rates: [],
    source: 'unavailable',
    sourceUrls: [],
    error: 'No se pudo obtener ninguna lectura real de El Toque (requiere acceso a eltoque.com, ELTOQUE_API_TOKEN o GEMINI_API_KEY para Google Search).',
  };
}

async function fetchRealCryptoRates(): Promise<{
  assets: StoredCryptoItem[];
  source: DataSourceMode;
  error: string | null;
}> {
  // 1. CoinGecko Markets API
  try {
    const ids = CRYPTO_META.map((c) => c.coingeckoId).join(',');
    const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
    const res = await fetchWithTimeout(cgUrl, {}, 5000);
    if (res.ok) {
      const items = (await res.json()) as Array<{
        symbol: string;
        current_price: number;
        price_change_percentage_24h: number;
        total_volume: number;
        market_cap: number;
      }>;
      if (Array.isArray(items) && items.length > 0) {
        const byId = new Map(items.map((i) => [(i as { id?: string }).id ?? '', i]));
        const bySym = new Map(items.map((i) => [i.symbol.toUpperCase(), i]));
        const assets: StoredCryptoItem[] = [];
        for (const meta of CRYPTO_META) {
          const match = byId.get(meta.coingeckoId) ?? bySym.get(meta.symbol);
          if (match && Number.isFinite(match.current_price)) {
            assets.push({
              symbol: meta.symbol,
              priceUsd: match.current_price,
              change24h: Number((match.price_change_percentage_24h ?? 0).toFixed(2)),
              volume24hUsd: match.total_volume ?? 0,
              marketCapUsd: match.market_cap ?? 0,
            });
          }
        }
        if (assets.length > 0) {
          state.lastRealCrypto = { fetchedAt: new Date().toISOString(), source: 'live', assets };
          persistState();
          return { assets, source: 'live', error: null };
        }
      }
    }
  } catch {
    // Try Binance public API
  }

  // 2. Binance 24hr Ticker API
  try {
    const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'TONUSDT', 'USDCUSDT'];
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    if (res.ok) {
      const tickers = (await res.json()) as Array<{
        symbol: string;
        lastPrice: string;
        priceChangePercent: string;
        quoteVolume: string;
      }>;
      if (Array.isArray(tickers) && tickers.length > 0) {
        const map = new Map(tickers.map((t) => [t.symbol, t]));
        const assets: StoredCryptoItem[] = [];
        for (const meta of CRYPTO_META) {
          if (meta.symbol === 'USDT') {
            const usdc = map.get('USDCUSDT');
            if (usdc && Number(usdc.lastPrice) > 0) {
              assets.push({
                symbol: 'USDT',
                priceUsd: Number((1 / Number(usdc.lastPrice)).toFixed(4)),
                change24h: Number((-Number(usdc.priceChangePercent)).toFixed(2)),
                volume24hUsd: Number(usdc.quoteVolume),
                marketCapUsd: 0,
              });
            }
            continue;
          }
          const t = map.get(`${meta.symbol}USDT`);
          if (t && Number(t.lastPrice) > 0) {
            assets.push({
              symbol: meta.symbol,
              priceUsd: Number(t.lastPrice),
              change24h: Number(Number(t.priceChangePercent).toFixed(2)),
              volume24hUsd: Number(t.quoteVolume),
              marketCapUsd: 0,
            });
          }
        }
        if (assets.length > 0) {
          state.lastRealCrypto = { fetchedAt: new Date().toISOString(), source: 'live', assets };
          persistState();
          return { assets, source: 'live', error: null };
        }
      }
    }
  } catch {
    // Fall through to last real persisted snapshot
  }

  if (state.lastRealCrypto && state.lastRealCrypto.assets.length > 0) {
    return {
      assets: state.lastRealCrypto.assets,
      source: 'stale',
      error: `APIs cripto temporalmente no disponibles; mostrando último dato real guardado (${new Date(state.lastRealCrypto.fetchedAt).toLocaleString('es-ES')}).`,
    };
  }

  return {
    assets: [],
    source: 'unavailable',
    error: 'No se pudieron obtener precios cripto reales desde CoinGecko ni Binance.',
  };
}

export async function getMarketSnapshot(forceRefresh = false): Promise<MarketSnapshot> {
  const now = Date.now();

  if (forceRefresh || !fiatCache || now - fiatCache.fetchedAt > FIAT_TTL_MS || fiatCache.data.length === 0) {
    const liveFiat = await fetchRealElToqueRates();
    fiatCache = {
      data: liveFiat.rates,
      fetchedAt: now,
      source: liveFiat.source,
      sourceUrls: liveFiat.sourceUrls,
      error: liveFiat.error,
    };
  }

  if (forceRefresh || !cryptoCache || now - cryptoCache.fetchedAt > CRYPTO_TTL_MS || cryptoCache.data.length === 0) {
    const liveCrypto = await fetchRealCryptoRates();
    cryptoCache = {
      data: liveCrypto.assets,
      fetchedAt: now,
      source: liveCrypto.source,
      error: liveCrypto.error,
    };
  }

  const fiatMap = new Map(fiatCache.data.map((d) => [d.code, d]));
  const fiatRates: FiatRate[] = [];

  for (const code of Object.keys(FIAT_NAMES) as Array<FiatRate['code']>) {
    const liveItem = fiatMap.get(code);
    const override = state.manualOverrides[code] ?? null;
    const isManualActive = Boolean(state.manualModeEnabled && override && override > 0);

    if (isManualActive && override) {
      fiatRates.push({
        code,
        name: FIAT_NAMES[code],
        rateToCup: override,
        change24h: liveItem?.change24h ?? null,
        source: 'manual',
        manualOverride: override,
        isManualActive: true,
      });
    } else if (liveItem) {
      fiatRates.push({
        code,
        name: FIAT_NAMES[code],
        rateToCup: liveItem.rateToCup,
        change24h: liveItem.change24h,
        source: fiatCache.source,
        manualOverride: override,
        isManualActive: false,
      });
    }
  }

  const usdToCup = fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? null;
  const cryptoAssets: CryptoAsset[] = cryptoCache.data.map((item) => {
    const meta = CRYPTO_META.find((m) => m.symbol === item.symbol)!;
    return {
      symbol: item.symbol,
      name: meta.name,
      priceUsd: item.priceUsd,
      priceCup: usdToCup !== null ? Number((item.priceUsd * usdToCup).toFixed(2)) : null,
      change24h: item.change24h,
      volume24hUsd: item.volume24hUsd,
      marketCapUsd: item.marketCapUsd,
      source: cryptoCache!.source,
    };
  });

  const elToqueSource: DataSourceMode = state.manualModeEnabled
    ? 'manual'
    : fiatCache.source;

  return {
    updatedAt: new Date(Math.max(fiatCache.fetchedAt, cryptoCache.fetchedAt)).toISOString(),
    elToqueUpdatedAt:
      elToqueSource === 'stale' && state.lastRealFiat
        ? state.lastRealFiat.fetchedAt
        : fiatRates.length > 0
          ? new Date(fiatCache.fetchedAt).toISOString()
          : null,
    cryptoUpdatedAt:
      cryptoCache.source === 'stale' && state.lastRealCrypto
        ? state.lastRealCrypto.fetchedAt
        : cryptoAssets.length > 0
          ? new Date(cryptoCache.fetchedAt).toISOString()
          : null,
    elToqueSource,
    cryptoSource: cryptoCache.source,
    elToqueError: state.manualModeEnabled ? null : (fiatCache.error ?? null),
    cryptoError: cryptoCache.error ?? null,
    sourceUrls: fiatCache.sourceUrls ?? [],
    fiatRates,
    cryptoAssets,
    cacheAgeSeconds: Math.round((now - Math.min(fiatCache.fetchedAt, cryptoCache.fetchedAt)) / 1000),
  };
}

export async function getHistoricalSeries(symbol: string, range: TimeRange): Promise<HistoricalSeriesResponse> {
  const upper = symbol.toUpperCase();
  const snapshot = await getMarketSnapshot(false);
  const usdCup = snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? null;

  const cryptoMeta = CRYPTO_META.find((c) => c.symbol === upper);

  if (cryptoMeta) {
    // 1. CoinGecko real market_chart
    const days = range === '24H' ? '1' : range === '7D' ? '7' : '30';
    try {
      const res = await fetchWithTimeout(
        `https://api.coingecko.com/api/v3/coins/${cryptoMeta.coingeckoId}/market_chart?vs_currency=usd&days=${days}`,
        {},
        5000
      );
      if (res.ok) {
        const json = (await res.json()) as { prices?: Array<[number, number]> };
        if (Array.isArray(json.prices) && json.prices.length > 1) {
          const step = Math.max(1, Math.floor(json.prices.length / 28));
          const sampled = json.prices.filter((_, idx) => idx % step === 0).slice(-28);
          return {
            symbol: upper,
            range,
            source: 'live',
            points: sampled.map(([ts, price]) => {
              const d = new Date(ts);
              const label =
                range === '24H'
                  ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                  : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
              return {
                label,
                timestamp: d.toISOString(),
                value: Number(price.toFixed(price < 10 ? 4 : 2)),
                secondaryValue: usdCup ? Number((price * usdCup).toFixed(0)) : undefined,
              };
            }),
          };
        }
      }
    } catch {
      // Fallback to Binance real klines
    }

    // 2. Binance real klines (no API key required)
    if (upper !== 'USDT') {
      try {
        const interval = range === '24H' ? '1h' : range === '7D' ? '4h' : '1d';
        const limit = range === '24H' ? 24 : range === '7D' ? 42 : 30;
        const res = await fetchWithTimeout(
          `https://api.binance.com/api/v3/klines?symbol=${upper}USDT&interval=${interval}&limit=${limit}`,
          {},
          5000
        );
        if (res.ok) {
          const klines = (await res.json()) as Array<[number, string, string, string, string]>;
          if (Array.isArray(klines) && klines.length > 0) {
            return {
              symbol: upper,
              range,
              source: 'live',
              points: klines.map((k) => {
                const d = new Date(k[0]);
                const close = Number(k[4]);
                const label =
                  range === '24H'
                    ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                    : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                return {
                  label,
                  timestamp: d.toISOString(),
                  value: Number(close.toFixed(close < 10 ? 4 : 2)),
                  secondaryValue: usdCup ? Number((close * usdCup).toFixed(0)) : undefined,
                };
              }),
            };
          }
        }
      } catch {
        // Unavailable
      }
    }

    return {
      symbol: upper,
      range,
      source: 'unavailable',
      points: [],
      message: 'No se pudo obtener el historial real desde CoinGecko ni Binance en este momento.',
    };
  }

  // Real recorded El Toque fiat history from persisted snapshots (zero invented waves)
  const rawSeries = state.fiatHistory[upper] ?? [];
  const cutoffMs =
    range === '24H' ? 24 * 3600_000 : range === '7D' ? 7 * 24 * 3600_000 : 30 * 24 * 3600_000;
  const now = Date.now();
  const filtered = rawSeries.filter((p) => now - new Date(p.timestamp).getTime() <= cutoffMs);

  const points: HistoricalPoint[] = filtered.map((p) => {
    const d = new Date(p.timestamp);
    return {
      label:
        range === '24H'
          ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      timestamp: p.timestamp,
      value: p.value,
    };
  });

  return {
    symbol: upper,
    range,
    source: points.length > 0 ? snapshot.elToqueSource : 'unavailable',
    points,
    message:
      points.length < 2
        ? `Solo existen ${points.length} captura(s) real(es) guardada(s) para ${upper}. El gráfico se construye únicamente con lecturas reales acumuladas sin simular tendencias.`
        : undefined,
  };
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
  usdValue: number | null;
  cupValue: number | null;
} | null> {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const snapshot = await getMarketSnapshot(false);
  const from = fromSymbol.toUpperCase();
  const to = toSymbol.toUpperCase();

  const usdToCup = snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? null;

  const getValueInUsd = (sym: string): number | null => {
    if (sym === 'USD') return 1;
    if (sym === 'CUP') return usdToCup ? 1 / usdToCup : null;
    const fiat = snapshot.fiatRates.find((f) => f.code === sym);
    if (fiat && usdToCup) return fiat.rateToCup / usdToCup;
    const crypto = snapshot.cryptoAssets.find((c) => c.symbol === sym);
    if (crypto) return crypto.priceUsd;
    return null;
  };

  // Direct CUP-to-Fiat conversion even if USD itself isn't in fiatRates
  const getValueInCup = (sym: string): number | null => {
    if (sym === 'CUP') return 1;
    const fiat = snapshot.fiatRates.find((f) => f.code === sym);
    if (fiat) return fiat.rateToCup;
    const crypto = snapshot.cryptoAssets.find((c) => c.symbol === sym);
    if (crypto && usdToCup) return crypto.priceUsd * usdToCup;
    return null;
  };

  const fromCup = getValueInCup(from);
  const toCup = getValueInCup(to);
  if (fromCup !== null && toCup !== null && toCup > 0) {
    const cupValue = amount * fromCup;
    return {
      amount,
      from,
      to,
      result: cupValue / toCup,
      effectiveRate: fromCup / toCup,
      usdValue: usdToCup ? cupValue / usdToCup : null,
      cupValue,
    };
  }

  const fromUsd = getValueInUsd(from);
  const toUsd = getValueInUsd(to);
  if (fromUsd !== null && toUsd !== null && toUsd > 0) {
    const usdValue = amount * fromUsd;
    return {
      amount,
      from,
      to,
      result: usdValue / toUsd,
      effectiveRate: fromUsd / toUsd,
      usdValue,
      cupValue: usdToCup ? usdValue * usdToCup : null,
    };
  }

  return null;
}

export async function calculateRemittances(amountUsd: number): Promise<{
  error: string | null;
  quotes: Array<
    RemittanceGateway & {
      sendAmountUsd: number;
      feeUsd: number;
      netUsd: number;
      deliveredAmount: number;
      effectiveCupRate: number;
    }
  >;
}> {
  const snapshot = await getMarketSnapshot(false);
  const usdToCup = snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? null;
  const mlcToCup = snapshot.fiatRates.find((f) => f.code === 'MLC')?.rateToCup ?? null;

  if (!usdToCup) {
    return {
      error: snapshot.elToqueError ?? 'No hay tasa real USD/CUP disponible en este momento para calcular entregas en CUP.',
      quotes: [],
    };
  }

  const quotes = state.gateways
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
      } else if (gw.payoutCurrency === 'MLC' && mlcToCup) {
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

  return { error: null, quotes };
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
