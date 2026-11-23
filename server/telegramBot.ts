import { Markup, Telegraf } from 'telegraf';
import type { Express } from 'express';
import type { BotInlineButton, BotRuntimeStatus, BotSimulatedReply, DataSourceMode } from '../src/types/market.ts';
import {
  calculateRemittances,
  convertCurrencies,
  getMarketSnapshot,
  recordBotInteraction,
} from './ratesEngine.ts';
import { generateMarketAnalysis } from './aiAnalyst.ts';

const runtimeStatus: BotRuntimeStatus = {
  mode: 'standby',
  hasToken: false,
  botUsername: null,
  startedAt: new Date().toISOString(),
  lastError: null,
};

let activeBot: Telegraf | null = null;

function formatNum(n: number, decimals = 2): string {
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatSign(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function describeElToqueSource(mode: DataSourceMode): string {
  if (mode === 'live') return 'elTOQUE (en vivo)';
  if (mode === 'search-grounded') return 'elTOQUE vía Google Search en vivo';
  if (mode === 'manual') return 'Manual (Administrador)';
  if (mode === 'stale') return 'Último dato real guardado';
  return 'No disponible';
}

const MAIN_MENU_BUTTONS: BotInlineButton[][] = [
  [
    { text: 'Tasas El Toque', callbackData: 'cb:toque' },
    { text: 'Criptomonedas', callbackData: 'cb:cripto' },
  ],
  [
    { text: '100 USD a CUP', callbackData: 'cb:convert_100_usd' },
    { text: 'Remesa $100', callbackData: 'cb:remesa_100' },
  ],
  [{ text: 'Resumen IA del mercado', callbackData: 'cb:ia_resumen' }],
];

export async function executeBotCommand(
  rawInput: string,
  meta: { origin: 'telegram' | 'simulator'; userId: string; username: string }
): Promise<BotSimulatedReply> {
  const started = Date.now();
  const trimmed = rawInput.trim();
  const normalized = trimmed.toLowerCase();

  let text = '';
  let buttons: BotInlineButton[][] = MAIN_MENU_BUTTONS;

  try {
    if (normalized === '/start' || normalized === '/ayuda' || normalized === '/help' || normalized === 'cb:menu') {
      text = [
        'CambioCubano Bot — Tasas Reales en Tiempo Real',
        '',
        'Comandos disponibles:',
        '/toque — Tasas reales de elTOQUE en Cuba (USD, EUR, MLC, etc.)',
        '/cripto — Bitcoin, Ethereum, USDT, Solana, BNB y Toncoin',
        '/convertir 100 USD CUP — Conversor cruzado divisas y cripto',
        '/remesa 100 — Comparativa neta por Binance Pay, Zelle, TropiPay',
        '/ia <pregunta> — Análisis cambiario con datos reales',
        '',
        'Pulsa cualquier botón inferior para consultar al instante.',
      ].join('\n');
    } else if (
      normalized === '/toque' ||
      normalized === '/precio' ||
      normalized === '/divisas' ||
      normalized === 'cb:toque'
    ) {
      const snap = await getMarketSnapshot(false);
      if (snap.fiatRates.length === 0) {
        text = `No hay tasas reales disponibles de El Toque en este momento.\nDetalle: ${snap.elToqueError ?? 'Fuente externa sin respuesta.'}`;
      } else {
        const sourceLabel = describeElToqueSource(snap.elToqueSource);
        const lines = snap.fiatRates.map((f) => {
          const varStr = f.change24h !== null ? ` (${formatSign(f.change24h)})` : '';
          return `${f.code.padEnd(7, ' ')} ${formatNum(f.rateToCup, 2)} CUP${varStr}`;
        });
        const updatedLabel = snap.elToqueUpdatedAt
          ? new Date(snap.elToqueUpdatedAt).toLocaleString('es-ES')
          : 'Desconocida';
        text = [
          `Tasas de Cambio Cuba · ${sourceLabel}`,
          '--------------------------------',
          ...lines,
          '--------------------------------',
          `Lectura real: ${updatedLabel}`,
          ...(snap.elToqueError ? [`Aviso: ${snap.elToqueError}`] : []),
        ].join('\n');
      }
      buttons = [
        [
          { text: 'Ver Cripto', callbackData: 'cb:cripto' },
          { text: '100 USD a CUP', callbackData: 'cb:convert_100_usd' },
        ],
        [{ text: 'Resumen IA', callbackData: 'cb:ia_resumen' }],
      ];
    } else if (normalized === '/cripto' || normalized === '/crypto' || normalized === 'cb:cripto') {
      const snap = await getMarketSnapshot(false);
      if (snap.cryptoAssets.length === 0) {
        text = `No se pudieron consultar precios cripto reales en este momento.\nDetalle: ${snap.cryptoError ?? 'CoinGecko y Binance sin respuesta.'}`;
      } else {
        const lines = snap.cryptoAssets.map((c) => {
          const cupPart = c.priceCup !== null ? ` · ${Math.round(c.priceCup).toLocaleString('es-ES')} CUP` : '';
          return `${c.symbol.padEnd(5, ' ')} $${formatNum(c.priceUsd, c.priceUsd < 10 ? 4 : 2)} USD${cupPart} (${formatSign(c.change24h)})`;
        });
        const updatedLabel = snap.cryptoUpdatedAt
          ? new Date(snap.cryptoUpdatedAt).toLocaleString('es-ES')
          : 'Desconocida';
        text = [
          `Criptomonedas Principales · ${snap.cryptoSource === 'live' ? 'Spot en vivo' : 'Último dato real'}`,
          '--------------------------------',
          ...lines,
          '--------------------------------',
          `Actualizado: ${updatedLabel}`,
          ...(snap.cryptoError ? [`Aviso: ${snap.cryptoError}`] : []),
        ].join('\n');
      }
      buttons = [
        [
          { text: 'Tasas El Toque', callbackData: 'cb:toque' },
          { text: 'Remesa $100', callbackData: 'cb:remesa_100' },
        ],
      ];
    } else if (
      normalized === 'cb:convert_100_usd' ||
      normalized.startsWith('/convertir') ||
      normalized.startsWith('/convert') ||
      normalized.startsWith('/c ')
    ) {
      let amount = 100;
      let from = 'USD';
      let to = 'CUP';

      if (normalized !== 'cb:convert_100_usd') {
        const parts = trimmed.split(/\s+/).slice(1);
        if (parts.length >= 2) {
          const parsedAmt = Number(parts[0].replace(',', '.'));
          if (Number.isFinite(parsedAmt) && parsedAmt > 0) {
            amount = parsedAmt;
            from = parts[1].toUpperCase();
            to = (parts[2] ?? 'CUP').toUpperCase();
          }
        }
      }

      const conv = await convertCurrencies(amount, from, to);
      if (!conv) {
        text = `No se pudo realizar la conversión (${from} a ${to}). Verifica que las tasas reales estén disponibles o usa: /convertir 100 USD CUP`;
      } else {
        const decimals = conv.result < 1 ? 6 : 2;
        text = [
          'Conversión con Tasas Reales',
          `${formatNum(conv.amount, conv.amount < 1 ? 4 : 2)} ${conv.from} = ${formatNum(conv.result, decimals)} ${conv.to}`,
          '',
          `Tasa efectiva: 1 ${conv.from} = ${formatNum(conv.effectiveRate, conv.effectiveRate < 1 ? 6 : 2)} ${conv.to}`,
          ...(conv.usdValue !== null ? [`Equivalente USD: $${formatNum(conv.usdValue, 2)}`] : []),
          ...(conv.cupValue !== null ? [`Equivalente CUP: ${Math.round(conv.cupValue).toLocaleString('es-ES')} CUP`] : []),
        ].join('\n');
      }
    } else if (normalized === 'cb:remesa_100' || normalized.startsWith('/remesa')) {
      const parts = trimmed.split(/\s+/).slice(1);
      const amount = parts[0] && Number(parts[0]) > 0 ? Number(parts[0]) : 100;
      const result = await calculateRemittances(amount);
      if (result.error || result.quotes.length === 0) {
        text = result.error ?? 'No hay tasa real disponible para calcular remesas.';
      } else {
        const lines = result.quotes.map(
          (r) =>
            `${r.name}\n  Recibe: ${r.deliveredAmount.toLocaleString('es-ES')} ${r.payoutCurrency} (Comisión $${r.feeUsd} · ${r.deliveryTime})`
        );
        text = [
          `Comparativa de Remesa para $${formatNum(amount, 2)} USD`,
          '--------------------------------',
          ...lines,
        ].join('\n');
      }
    } else if (normalized === 'cb:ia_resumen' || normalized.startsWith('/ia')) {
      const query =
        normalized === 'cb:ia_resumen'
          ? 'Resume la situación actual de USD, EUR, MLC y Bitcoin para quien cambia hoy en Cuba.'
          : trimmed.replace(/^\/ia\s*/i, '');
      try {
        text = await generateMarketAnalysis(query);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al consultar Gemini.';
        text = `Análisis IA no disponible: ${msg}`;
      }
    } else {
      const token = trimmed.toUpperCase().replace('/', '');
      const snap = await getMarketSnapshot(false);
      const fiat = snap.fiatRates.find((f) => f.code === token);
      const crypto = snap.cryptoAssets.find((c) => c.symbol === token);

      if (fiat) {
        const varStr = fiat.change24h !== null ? ` (${formatSign(fiat.change24h)})` : '';
        text = `${fiat.code} (${fiat.name})\n1 ${fiat.code} = ${formatNum(fiat.rateToCup, 2)} CUP${varStr}\nFuente: ${describeElToqueSource(fiat.source)}`;
      } else if (crypto) {
        const cupStr = crypto.priceCup !== null ? `\nEn CUP: ${Math.round(crypto.priceCup).toLocaleString('es-ES')} CUP` : '';
        text = `${crypto.symbol} (${crypto.name})\nPrecio: $${formatNum(crypto.priceUsd, crypto.priceUsd < 10 ? 4 : 2)} USD (${formatSign(crypto.change24h)})${cupStr}`;
      } else {
        text = `No reconocí "${trimmed}". Usa /toque, /cripto, /convertir 100 USD CUP, /remesa 100 o /ia <pregunta>.`;
      }
    }
  } catch (err) {
    text = `Error procesando solicitud: ${err instanceof Error ? err.message : 'Error desconocido'}`;
  }

  const latencyMs = Date.now() - started;
  recordBotInteraction({
    origin: meta.origin,
    userId: meta.userId,
    username: meta.username,
    command: trimmed,
    responsePreview: text.replace(/\n+/g, ' '),
    latencyMs,
  });

  return {
    text,
    buttons,
    latencyMs,
    commandUsed: trimmed,
  };
}

function toTelegrafMarkup(buttons: BotInlineButton[][]) {
  return Markup.inlineKeyboard(
    buttons.map((row) => row.map((btn) => Markup.button.callback(btn.text, btn.callbackData)))
  );
}

export function initTelegramBot(app: Express): void {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    runtimeStatus.mode = 'standby';
    runtimeStatus.hasToken = false;
    runtimeStatus.lastError = null;
    return;
  }

  runtimeStatus.hasToken = true;
  const bot = new Telegraf(token);
  activeBot = bot;

  bot.on('text', async (ctx) => {
    const userId = String(ctx.from?.id ?? 'anon');
    const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? 'Usuario';
    const reply = await executeBotCommand(ctx.message.text, {
      origin: 'telegram',
      userId,
      username,
    });
    await ctx.reply(reply.text, toTelegrafMarkup(reply.buttons));
  });

  bot.on('callback_query', async (ctx) => {
    const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : 'cb:menu';
    const userId = String(ctx.from?.id ?? 'anon');
    const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? 'Usuario';
    const reply = await executeBotCommand(data, {
      origin: 'telegram',
      userId,
      username,
    });
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(reply.text, toTelegrafMarkup(reply.buttons));
  });

  const webhookUrl = process.env.WEBHOOK_URL?.trim();

  if (webhookUrl) {
    try {
      const parsed = new URL(webhookUrl);
      const webhookPath = parsed.pathname || '/api/telegram/webhook';
      app.use(bot.webhookCallback(webhookPath));
    } catch (err) {
      runtimeStatus.lastError = `WEBHOOK_URL inválida: ${err instanceof Error ? err.message : 'URL inválida'}`;
    }
  }

  void (async () => {
    try {
      const me = await bot.telegram.getMe();
      runtimeStatus.botUsername = me.username ? `@${me.username}` : null;

      if (webhookUrl) {
        await bot.telegram.setWebhook(webhookUrl);
        runtimeStatus.mode = 'webhook';
        console.log(`[TelegramBot] Webhook activo en ${webhookUrl} como ${runtimeStatus.botUsername ?? 'bot'}`);
      } else {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        void bot.launch();
        runtimeStatus.mode = 'polling';
        console.log(`[TelegramBot] Long-polling activo en Altare como ${runtimeStatus.botUsername ?? 'bot'}`);
      }
      runtimeStatus.lastError = null;
    } catch (err) {
      runtimeStatus.mode = 'standby';
      runtimeStatus.lastError = err instanceof Error ? err.message : 'Error conectando con Telegram API';
      console.error('[TelegramBot] Error al iniciar:', runtimeStatus.lastError);
    }
  })();
}

export function getBotRuntimeStatus(): BotRuntimeStatus {
  return { ...runtimeStatus };
}

export function stopTelegramBot(signal: string): void {
  if (activeBot) {
    try {
      activeBot.stop(signal);
    } catch {
      // Already stopped
    }
  }
}
