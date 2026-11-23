import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { RemittanceGateway, TimeRange } from './src/types/market.ts';
import {
  calculateRemittances,
  convertCurrencies,
  getAdminStateSnapshot,
  getHistoricalSeries,
  getMarketSnapshot,
  updateGateways,
  updateManualOverrides,
} from './server/ratesEngine.ts';
import { generateMarketAnalysis } from './server/aiAnalyst.ts';
import {
  executeBotCommand,
  getBotRuntimeStatus,
  initTelegramBot,
  stopTelegramBot,
} from './server/telegramBot.ts';

const PORT = Number(process.env.PORT ?? 3000);
const STARTED_AT = Date.now();

async function bootstrap(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Altare / Cloud Run Health Check Endpoint
  app.get('/api/health', (_req, res) => {
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      memoryMb: Math.round(mem.rss / 1024 / 1024),
      botRuntime: getBotRuntimeStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  // Real-time unified market rates (El Toque + Crypto)
  app.get('/api/rates', async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const snapshot = await getMarketSnapshot(force);
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error obteniendo cotizaciones' });
    }
  });

  // Historical chart data
  app.get('/api/history/:symbol', async (req, res) => {
    try {
      const rawRange = String(req.query.range ?? '24H').toUpperCase();
      const range: TimeRange = rawRange === '7D' || rawRange === '30D' ? rawRange : '24H';
      const series = await getHistoricalSeries(req.params.symbol, range);
      res.json({ symbol: req.params.symbol.toUpperCase(), range, points: series });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error obteniendo históricos' });
    }
  });

  // Cross-currency & crypto converter
  app.post('/api/convert', async (req, res) => {
    try {
      const amount = Number(req.body?.amount ?? 0);
      const from = String(req.body?.from ?? 'USD');
      const to = String(req.body?.to ?? 'CUP');
      const converted = await convertCurrencies(amount, from, to);
      if (!converted) {
        res.status(400).json({ error: 'Par de monedas o monto inválido.' });
        return;
      }
      res.json(converted);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error de conversión' });
    }
  });

  // Remittance gateways calculator
  app.post('/api/remittances', async (req, res) => {
    try {
      const amountUsd = Number(req.body?.amountUsd ?? 100);
      if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
        res.status(400).json({ error: 'El monto debe ser mayor que 0.' });
        return;
      }
      const quotes = await calculateRemittances(amountUsd);
      res.json({ amountUsd, quotes });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error calculando remesas' });
    }
  });

  // Telegram Bot Command Simulator (identical handler to real Telegram worker)
  app.post('/api/bot/simulate', async (req, res) => {
    try {
      const command = String(req.body?.command ?? '/start').trim();
      if (!command) {
        res.status(400).json({ error: 'El comando no puede estar vacío.' });
        return;
      }
      const reply = await executeBotCommand(command, {
        origin: 'simulator',
        userId: 'web-admin',
        username: 'Consola Web',
      });
      res.json(reply);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error ejecutando comando del bot' });
    }
  });

  // Bot telemetry, logs & admin stats
  app.get('/api/bot/stats', (_req, res) => {
    res.json(getAdminStateSnapshot(getBotRuntimeStatus()));
  });

  // Manual override rates management
  app.post('/api/admin/overrides', async (req, res) => {
    try {
      const manualModeEnabled = Boolean(req.body?.manualModeEnabled);
      const overrides = (req.body?.overrides ?? {}) as Record<string, number | null>;
      updateManualOverrides(manualModeEnabled, overrides);
      const snapshot = await getMarketSnapshot(false);
      res.json({ ok: true, snapshot });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error guardando tasas manuales' });
    }
  });

  // Remittance gateway config updates
  app.post('/api/admin/gateways', (req, res) => {
    try {
      const gateways = req.body?.gateways as RemittanceGateway[];
      if (!Array.isArray(gateways)) {
        res.status(400).json({ error: 'Formato de pasarelas inválido.' });
        return;
      }
      updateGateways(gateways);
      res.json({ ok: true, gateways });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error actualizando pasarelas' });
    }
  });

  // Server-side Gemini AI Market Brief
  app.post('/api/ai/analyze', async (req, res) => {
    try {
      const question = String(req.body?.question ?? '');
      const analysis = await generateMarketAnalysis(question);
      res.json({ analysis, model: 'gemini-4-hydrogen', generatedAt: new Date().toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al consultar Gemini API';
      res.status(500).json({ error: message });
    }
  });

  // Initialize Telegram Bot (Polling or Webhook when TELEGRAM_BOT_TOKEN is set)
  await initTelegramBot(app);

  // Serve Vite middleware in dev OR static dist/ in production (Altare)
  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.npm_lifecycle_event !== 'dev' && fs.existsSync(distIndex));

  if (isProd && fs.existsSync(distIndex)) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(distIndex);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Consola y Bot API escuchando en http://0.0.0.0:${PORT} (${isProd ? 'producción' : 'desarrollo'})`);
  });

  const shutdown = (signal: string) => {
    console.log(`[Server] Recibida señal ${signal}, cerrando conexiones...`);
    stopTelegramBot(signal);
    server.close(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Server] Error fatal en arranque:', err);
  process.exit(1);
});
