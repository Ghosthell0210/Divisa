import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Sparkles,
  Send,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import type { DataSourceMode, MarketSnapshot } from '../types/market';

interface OverviewPanelProps {
  snapshot: MarketSnapshot | null;
  loading: boolean;
  onSelectAssetForChart: (symbol: string) => void;
}

const SYMBOL_LABELS: Record<string, string> = {
  USD: 'USD — Dólar Efectivo',
  EUR: 'EUR — Euro',
  MLC: 'MLC — Moneda Libremente Convertible',
  USDT_TRC20: 'USDT_TRC20 — USDT en Cuba (TRMCC)',
  ZELLE: 'ZELLE — Saldo Zelle USD',
  CLASICA: 'CLASICA — Tarjeta Clásica',
  CAD: 'CAD — Dólar Canadiense',
  MXN: 'MXN — Peso Mexicano',
  CUP: 'CUP — Peso Cubano',
  BTC: 'BTC — Bitcoin',
  ETH: 'ETH — Ethereum',
  USDT: 'USDT — Tether Spot',
  SOL: 'SOL — Solana',
  BNB: 'BNB — BNB',
  TON: 'TON — Toncoin',
};

function formatCompactUsd(val: number): string {
  if (!val || val <= 0) return '—';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toLocaleString('en-US')}`;
}

function sourceText(mode: DataSourceMode): string {
  if (mode === 'live') return 'elTOQUE en vivo';
  if (mode === 'search-grounded') return 'elTOQUE · Google Search';
  if (mode === 'manual') return 'Manual';
  if (mode === 'stale') return 'Último dato real';
  return 'No disponible';
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({
  snapshot,
  loading,
  onSelectAssetForChart,
}) => {
  const [amountStr, setAmountStr] = useState<string>('100');
  const [fromCurrency, setFromCurrency] = useState<string>('USD');
  const [toCurrency, setToCurrency] = useState<string>('CUP');

  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  const availableSymbols = useMemo(() => {
    const list: string[] = [];
    if (snapshot) {
      for (const f of snapshot.fiatRates) list.push(f.code);
      if (snapshot.fiatRates.length > 0) list.push('CUP');
      for (const c of snapshot.cryptoAssets) list.push(c.symbol);
    }
    return list.length > 0 ? list : ['USD', 'CUP', 'BTC', 'USDT'];
  }, [snapshot]);

  const conversion = useMemo(() => {
    if (!snapshot) return null;
    const amount = Number(amountStr.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) return null;

    const usdRate = snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? null;
    const usdtTrc20Rate = snapshot.fiatRates.find((f) => f.code === 'USDT_TRC20')?.rateToCup ?? null;

    const toCup = (sym: string): number | null => {
      if (sym === 'CUP') return 1;
      if (sym === 'USDT' && usdtTrc20Rate !== null) return usdtTrc20Rate;
      const fiat = snapshot.fiatRates.find((f) => f.code === sym);
      if (fiat) return fiat.rateToCup;
      const crypto = snapshot.cryptoAssets.find((c) => c.symbol === sym);
      const cryptoCupBase = usdtTrc20Rate ?? usdRate;
      if (crypto && cryptoCupBase) return crypto.priceUsd * cryptoCupBase;
      return null;
    };

    const fromVal = toCup(fromCurrency);
    const toVal = toCup(toCurrency);
    if (fromVal !== null && toVal !== null && toVal > 0) {
      const totalCup = amount * fromVal;
      return {
        result: totalCup / toVal,
        effectiveRate: fromVal / toVal,
        totalCup,
        totalUsd: usdRate ? totalCup / usdRate : null,
      };
    }

    // Fallback to direct USD conversion when both are crypto/USD and El Toque CUP isn't available
    const toUsdDirect = (sym: string): number | null => {
      if (sym === 'USD') return 1;
      const crypto = snapshot.cryptoAssets.find((c) => c.symbol === sym);
      return crypto ? crypto.priceUsd : null;
    };
    const fromUsd = toUsdDirect(fromCurrency);
    const toUsd = toUsdDirect(toCurrency);
    if (fromUsd !== null && toUsd !== null && toUsd > 0) {
      const totalUsd = amount * fromUsd;
      return {
        result: totalUsd / toUsd,
        effectiveRate: fromUsd / toUsd,
        totalCup: null,
        totalUsd,
      };
    }

    return null;
  }, [snapshot, amountStr, fromCurrency, toCurrency]);

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const askAi = async (customPrompt?: string) => {
    const q = (customPrompt ?? aiQuestion).trim() || 'Dame un resumen corto de las tasas reales de El Toque y Bitcoin hoy.';
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as { analysis?: string; error?: string };
      if (!res.ok || !data.analysis) {
        throw new Error(data.error ?? 'No se pudo obtener respuesta del analista.');
      }
      setAiResponse(data.analysis);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error consultando análisis IA.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  const usd = snapshot?.fiatRates.find((f) => f.code === 'USD');
  const eur = snapshot?.fiatRates.find((f) => f.code === 'EUR');
  const mlc = snapshot?.fiatRates.find((f) => f.code === 'MLC');
  const btc = snapshot?.cryptoAssets.find((c) => c.symbol === 'BTC');

  const kpis = [
    {
      symbol: 'USD',
      title: 'Dólar (elTOQUE)',
      value: usd ? `${usd.rateToCup.toFixed(2)} CUP` : 'Sin lectura',
      change: usd?.change24h ?? null,
      meta: snapshot ? sourceText(snapshot.elToqueSource) : '—',
    },
    {
      symbol: 'EUR',
      title: 'Euro (elTOQUE)',
      value: eur ? `${eur.rateToCup.toFixed(2)} CUP` : 'Sin lectura',
      change: eur?.change24h ?? null,
      meta: snapshot ? sourceText(snapshot.elToqueSource) : '—',
    },
    {
      symbol: 'MLC',
      title: 'MLC Digital',
      value: mlc ? `${mlc.rateToCup.toFixed(2)} CUP` : 'Sin lectura',
      change: mlc?.change24h ?? null,
      meta: snapshot ? sourceText(snapshot.elToqueSource) : '—',
    },
    {
      symbol: 'BTC',
      title: 'Bitcoin Spot',
      value: btc ? `$${btc.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : 'Sin lectura',
      change: btc?.change24h ?? null,
      meta: btc && btc.priceCup !== null ? `${Math.round(btc.priceCup).toLocaleString('es-ES')} CUP` : 'Mercado Spot',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top 4 KPI Strip */}
      <section aria-label="Indicadores principales" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((item) => {
          const isPositive = (item.change ?? 0) >= 0;
          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => onSelectAssetForChart(item.symbol)}
              className="text-left bg-[#111827] hover:bg-[#161F33] border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>{item.title}</span>
                <span className="font-mono text-slate-500">{item.symbol}</span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
                {item.value}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400 truncate">{item.meta}</span>
                {item.change !== null ? (
                  <span
                    className={`inline-flex items-center gap-1 font-mono font-medium tabular-nums shrink-0 ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {isPositive ? '+' : ''}
                    {item.change.toFixed(2)}%
                  </span>
                ) : (
                  <span className="font-mono text-slate-500 shrink-0">Real</span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Quick Converter + AI Market Brief */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Converter */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Conversor Rápido Divisas y Cripto</h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  Calculado exclusivamente con las tasas reales vigentes en este momento.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                {['50', '100', '500', '1000'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmountStr(preset)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                      amountStr === preset
                        ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <div>
                <label htmlFor="conv-amount" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Monto y moneda origen
                </label>
                <div className="flex flex-col gap-2">
                  <input
                    id="conv-amount"
                    type="number"
                    min="0"
                    step="any"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="w-full bg-[#0B1120] border border-slate-700 focus:border-sky-500 rounded-lg px-3.5 py-2.5 font-mono text-base text-slate-100 tabular-nums focus:outline-none"
                    placeholder="100"
                  />
                  <select
                    aria-label="Moneda de origen"
                    value={fromCurrency}
                    onChange={(e) => setFromCurrency(e.target.value)}
                    className="w-full bg-[#0B1120] border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  >
                    {availableSymbols.map((code) => (
                      <option key={code} value={code}>
                        {SYMBOL_LABELS[code] ?? code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSwap}
                aria-label="Intercambiar monedas"
                className="self-center md:mb-1 h-10 w-10 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors"
              >
                <ArrowRightLeft className="w-4 h-4" />
              </button>

              <div>
                <label htmlFor="conv-to" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Resultado real
                </label>
                <div className="flex flex-col gap-2">
                  <div className="w-full bg-[#0B1120] border border-slate-800 rounded-lg px-3.5 py-2.5 font-mono text-base font-semibold text-sky-400 tabular-nums truncate">
                    {conversion
                      ? `${conversion.result.toLocaleString('es-ES', {
                          minimumFractionDigits: conversion.result < 1 ? 6 : 2,
                          maximumFractionDigits: conversion.result < 1 ? 6 : 2,
                        })} ${toCurrency}`
                      : 'Sin tasa disponible'}
                  </div>
                  <select
                    id="conv-to"
                    value={toCurrency}
                    onChange={(e) => setToCurrency(e.target.value)}
                    className="w-full bg-[#0B1120] border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  >
                    {availableSymbols.map((code) => (
                      <option key={code} value={code}>
                        {SYMBOL_LABELS[code] ?? code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400">Tasa unitaria</span>
              <p className="mt-0.5 font-mono text-sm text-slate-200 tabular-nums">
                {conversion
                  ? `1 ${fromCurrency} = ${conversion.effectiveRate.toLocaleString('es-ES', {
                      maximumFractionDigits: conversion.effectiveRate < 1 ? 6 : 2,
                    })} ${toCurrency}`
                  : '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Valor en CUP</span>
              <p className="mt-0.5 font-mono text-sm text-slate-200 tabular-nums">
                {conversion && conversion.totalCup !== null
                  ? `${Math.round(conversion.totalCup).toLocaleString('es-ES')} CUP`
                  : '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Valor en USD</span>
              <p className="mt-0.5 font-mono text-sm text-slate-200 tabular-nums">
                {conversion && conversion.totalUsd !== null
                  ? `$${conversion.totalUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* AI Analyst Box */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h2 className="text-lg font-semibold text-slate-100">Analista IA de Mercado</h2>
              </div>
              <span className="text-xs text-slate-400">Comando /ia</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Interpreta el spread real entre USD, MLC y criptomonedas usando únicamente las lecturas actuales.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                '¿Conviene cambiar USD o EUR hoy?',
                'Resumen de BTC y USDT en CUP',
                'Diferencia entre Zelle y MLC',
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setAiQuestion(prompt);
                    void askAi(prompt);
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-4 min-h-[116px] bg-[#0B1120] border border-slate-800 rounded-lg p-3.5 text-sm text-slate-200 leading-relaxed">
              {aiLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3.5 bg-slate-800 rounded w-5/6" />
                  <div className="h-3.5 bg-slate-800 rounded w-full" />
                  <div className="h-3.5 bg-slate-800 rounded w-3/4" />
                </div>
              ) : aiError ? (
                <p className="text-rose-400 text-xs leading-relaxed">{aiError}</p>
              ) : aiResponse ? (
                <p className="whitespace-pre-line">{aiResponse}</p>
              ) : (
                <p className="text-slate-500">
                  Selecciona una consulta rápida o escribe tu pregunta cambiaria para obtener un diagnóstico basado en las cotizaciones reales.
                </p>
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askAi();
            }}
            className="mt-4 flex gap-2"
          >
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Ej: ¿Cuánto son 250 EUR en USDT?"
              className="flex-1 bg-[#0B1120] border border-slate-700 focus:border-sky-500 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-medium text-sm transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Consultar
            </button>
          </form>
        </div>
      </section>

      {/* Dual High-Density Tables: El Toque Fiat & Crypto Spot */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Fiat Table */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Tasas Informales en Cuba (elTOQUE)</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {snapshot?.elToqueUpdatedAt
                    ? `Lectura real: ${new Date(snapshot.elToqueUpdatedAt).toLocaleString('es-ES')}`
                    : 'Sin lectura real disponible'}
                </p>
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {snapshot ? sourceText(snapshot.elToqueSource) : '—'}
              </span>
            </div>

            {snapshot?.elToqueError && (
              <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{snapshot.elToqueError}</span>
              </div>
            )}

            {snapshot && snapshot.fiatRates.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400">
                      <th className="py-3 px-6 font-medium">Divisa</th>
                      <th className="py-3 px-4 font-medium text-right">Tasa CUP</th>
                      <th className="py-3 px-4 font-medium text-right">Var. 24h</th>
                      <th className="py-3 px-6 font-medium text-right">Fuente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-sm">
                    {snapshot.fiatRates.map((rate) => {
                      const up = (rate.change24h ?? 0) >= 0;
                      return (
                        <tr
                          key={rate.code}
                          onClick={() => onSelectAssetForChart(rate.code)}
                          className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono font-semibold text-slate-100">{rate.code}</span>
                              <span className="text-slate-400 text-xs truncate max-w-[160px]">{rate.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium text-slate-100 tabular-nums">
                            {rate.rateToCup.toFixed(2)} CUP
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono tabular-nums ${
                              rate.change24h === null
                                ? 'text-slate-500'
                                : up
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                            }`}
                          >
                            {rate.change24h === null ? '—' : `${up ? '+' : ''}${rate.change24h.toFixed(2)}%`}
                          </td>
                          <td className="py-3 px-6 text-right text-xs text-slate-400">
                            {sourceText(rate.source)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-400">
                No se han recibido tasas reales de elTOQUE. Pulsa «Actualizar Tasas» para reintentar o configura <code className="text-slate-200">ELTOQUE_API_TOKEN</code>.
              </div>
            )}
          </div>

          {snapshot?.sourceUrls && snapshot.sourceUrls.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-800 bg-[#0B1120] flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>Fuentes verificadas:</span>
              {snapshot.sourceUrls.map((src) => (
                <a
                  key={src.uri}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 truncate max-w-[220px]"
                >
                  <span className="truncate">{src.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Crypto Table */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Criptomonedas Principales en Vivo</h3>
              <p className="text-xs text-slate-400 mt-0.5">Precios reales vía CoinGecko / Binance y equivalente CUP</p>
            </div>
            <button
              type="button"
              onClick={() => onSelectAssetForChart('BTC')}
              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Ver gráficos
            </button>
          </div>

          {snapshot?.cryptoError && (
            <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{snapshot.cryptoError}</span>
            </div>
          )}

          {snapshot && snapshot.cryptoAssets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-3 px-6 font-medium">Activo</th>
                    <th className="py-3 px-4 font-medium text-right">Precio USD</th>
                    <th className="py-3 px-4 font-medium text-right">En CUP</th>
                    <th className="py-3 px-4 font-medium text-right">Var. 24h</th>
                    <th className="py-3 px-6 font-medium text-right">Vol. 24h</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-sm">
                  {snapshot.cryptoAssets.map((coin) => {
                    const up = coin.change24h >= 0;
                    return (
                      <tr
                        key={coin.symbol}
                        onClick={() => onSelectAssetForChart(coin.symbol)}
                        className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-6">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-semibold text-slate-100">{coin.symbol}</span>
                            <span className="text-slate-400 text-xs">{coin.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-100 tabular-nums">
                          ${coin.priceUsd.toLocaleString('en-US', {
                            minimumFractionDigits: coin.priceUsd < 10 ? 4 : 2,
                            maximumFractionDigits: coin.priceUsd < 10 ? 4 : 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                          {coin.priceCup !== null ? Math.round(coin.priceCup).toLocaleString('es-ES') : '—'}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums ${
                            up ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {up ? '+' : ''}
                          {coin.change24h.toFixed(2)}%
                        </td>
                        <td className="py-3 px-6 text-right font-mono text-xs text-slate-400 tabular-nums">
                          {formatCompactUsd(coin.volume24hUsd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-400">
              No hay precios cripto reales disponibles en este momento.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
