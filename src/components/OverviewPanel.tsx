import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, ArrowUpRight, ArrowDownRight, Sparkles, Send, TrendingUp } from 'lucide-react';
import type { MarketSnapshot } from '../types/market';

interface OverviewPanelProps {
  snapshot: MarketSnapshot | null;
  loading: boolean;
  onSelectAssetForChart: (symbol: string) => void;
}

const ALL_SYMBOLS = [
  { code: 'USD', label: 'USD — Dólar EE.UU.' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'MLC', label: 'MLC — Moneda Libremente Convertible' },
  { code: 'ZELLE', label: 'ZELLE — Saldo Zelle USD' },
  { code: 'CLASICA', label: 'CLASICA — Tarjeta Clásica' },
  { code: 'CAD', label: 'CAD — Dólar Canadiense' },
  { code: 'MXN', label: 'MXN — Peso Mexicano' },
  { code: 'CUP', label: 'CUP — Peso Cubano' },
  { code: 'BTC', label: 'BTC — Bitcoin' },
  { code: 'ETH', label: 'ETH — Ethereum' },
  { code: 'USDT', label: 'USDT — Tether' },
  { code: 'SOL', label: 'SOL — Solana' },
  { code: 'BNB', label: 'BNB — BNB' },
  { code: 'TON', label: 'TON — Toncoin' },
];

function formatCompactUsd(val: number): string {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toLocaleString('en-US')}`;
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

  const conversion = useMemo(() => {
    if (!snapshot) return null;
    const amount = Number(amountStr.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) return null;

    const usdRate = snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup ?? 328;

    const toCup = (sym: string): number => {
      if (sym === 'CUP') return 1;
      const fiat = snapshot.fiatRates.find((f) => f.code === sym);
      if (fiat) return fiat.rateToCup;
      const crypto = snapshot.cryptoAssets.find((c) => c.symbol === sym);
      if (crypto) return crypto.priceUsd * usdRate;
      return 1;
    };

    const fromVal = toCup(fromCurrency);
    const toVal = toCup(toCurrency);
    const totalCup = amount * fromVal;
    const result = totalCup / toVal;

    return {
      result,
      effectiveRate: fromVal / toVal,
      totalCup,
      totalUsd: totalCup / usdRate,
    };
  }, [snapshot, amountStr, fromCurrency, toCurrency]);

  const handleSwap = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const askAi = async (customPrompt?: string) => {
    const q = (customPrompt ?? aiQuestion).trim() || 'Dame un resumen corto de las tasas de El Toque y Bitcoin hoy.';
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
      title: 'Dólar (El Toque)',
      value: usd ? `${usd.rateToCup.toFixed(2)} CUP` : '—',
      change: usd?.change24h ?? 0,
      meta: usd?.isManualActive ? 'Manual Verificada' : 'Mercado Informal',
    },
    {
      symbol: 'EUR',
      title: 'Euro (El Toque)',
      value: eur ? `${eur.rateToCup.toFixed(2)} CUP` : '—',
      change: eur?.change24h ?? 0,
      meta: eur?.isManualActive ? 'Manual Verificada' : 'Mercado Informal',
    },
    {
      symbol: 'MLC',
      title: 'MLC Digital',
      value: mlc ? `${mlc.rateToCup.toFixed(2)} CUP` : '—',
      change: mlc?.change24h ?? 0,
      meta: mlc?.isManualActive ? 'Manual Verificada' : 'Transferencia',
    },
    {
      symbol: 'BTC',
      title: 'Bitcoin Spot',
      value: btc ? `$${btc.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—',
      change: btc?.change24h ?? 0,
      meta: btc ? `${Math.round(btc.priceCup).toLocaleString('es-ES')} CUP` : '—',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top 4 KPI Strip */}
      <section aria-label="Indicadores principales" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((item) => {
          const isPositive = item.change >= 0;
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
                <span
                  className={`inline-flex items-center gap-1 font-mono font-medium tabular-nums shrink-0 ${
                    isPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {isPositive ? '+' : ''}
                  {item.change.toFixed(2)}%
                </span>
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
                  Cálculo instantáneo cruzado entre CUP, monedas de El Toque y criptomonedas.
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
                    {ALL_SYMBOLS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
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
                  Resultado estimado
                </label>
                <div className="flex flex-col gap-2">
                  <div className="w-full bg-[#0B1120] border border-slate-800 rounded-lg px-3.5 py-2.5 font-mono text-base font-semibold text-sky-400 tabular-nums truncate">
                    {conversion
                      ? `${conversion.result.toLocaleString('es-ES', {
                          minimumFractionDigits: conversion.result < 1 ? 6 : 2,
                          maximumFractionDigits: conversion.result < 1 ? 6 : 2,
                        })} ${toCurrency}`
                      : '—'}
                  </div>
                  <select
                    id="conv-to"
                    value={toCurrency}
                    onChange={(e) => setToCurrency(e.target.value)}
                    className="w-full bg-[#0B1120] border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  >
                    {ALL_SYMBOLS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
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
                {conversion ? `${Math.round(conversion.totalCup).toLocaleString('es-ES')} CUP` : '—'}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Valor en USD</span>
              <p className="mt-0.5 font-mono text-sm text-slate-200 tabular-nums">
                {conversion ? `$${conversion.totalUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD` : '—'}
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
              Consulta tendencias o interpreta el spread entre USD, MLC y criptomonedas en tiempo real.
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
                  Selecciona una consulta rápida o escribe tu pregunta cambiaria para obtener un diagnóstico basado en las cotizaciones activas.
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
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Tasas Informales en Cuba (El Toque)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Haz clic en una divisa para inspeccionar su gráfica histórica</p>
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">Base CUP</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-3 px-6 font-medium">Divisa</th>
                  <th className="py-3 px-4 font-medium text-right">Tasa CUP</th>
                  <th className="py-3 px-4 font-medium text-right">Var. 24h</th>
                  <th className="py-3 px-6 font-medium text-right">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {snapshot?.fiatRates.map((rate) => {
                  const up = rate.change24h >= 0;
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
                          up ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {up ? '+' : ''}
                        {rate.change24h.toFixed(2)}%
                      </td>
                      <td className="py-3 px-6 text-right text-xs text-slate-400">
                        {rate.isManualActive ? 'Manual' : rate.source === 'live' ? 'El Toque' : 'Respaldo'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Crypto Table */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Criptomonedas Principales en Vivo</h3>
              <p className="text-xs text-slate-400 mt-0.5">Precios spot internacionales y su equivalente en Pesos Cubanos</p>
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
                {snapshot?.cryptoAssets.map((coin) => {
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
                          minimumFractionDigits: coin.priceUsd < 10 ? 3 : 2,
                          maximumFractionDigits: coin.priceUsd < 10 ? 3 : 2,
                        })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums">
                        {Math.round(coin.priceCup).toLocaleString('es-ES')}
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
        </div>
      </section>
    </div>
  );
};
