import React, { useEffect, useState } from 'react';
import { Calculator } from 'lucide-react';
import type { RemittanceGateway } from '../types/market';

interface RemittanceQuote extends RemittanceGateway {
  sendAmountUsd: number;
  feeUsd: number;
  netUsd: number;
  deliveredAmount: number;
  effectiveCupRate: number;
}

export const RemittancesPanel: React.FC = () => {
  const [amountUsd, setAmountUsd] = useState<string>('200');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'CUP' | 'MLC'>('ALL');
  const [quotes, setQuotes] = useState<RemittanceQuote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuotes = async (amt: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/remittances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: amt }),
      });
      const data = (await res.json()) as { quotes?: RemittanceQuote[]; error?: string };
      if (!res.ok || !Array.isArray(data.quotes)) {
        throw new Error(data.error ?? 'Error calculando pasarelas');
      }
      setQuotes(data.quotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error calculando remesas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const parsed = Number(amountUsd);
    if (Number.isFinite(parsed) && parsed > 0) {
      void fetchQuotes(parsed);
    }
  }, [amountUsd]);

  const filtered = quotes
    .filter((q) => (currencyFilter === 'ALL' ? true : q.payoutCurrency === currencyFilter))
    .sort((a, b) => b.effectiveCupRate - a.effectiveCupRate);

  const bestId = filtered[0]?.id;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div>
            <label htmlFor="remit-usd" className="block text-xs font-medium text-slate-400 mb-1.5">
              Monto a enviar (USD)
            </label>
            <div className="relative">
              <input
                id="remit-usd"
                type="number"
                min="1"
                step="any"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                className="w-48 bg-[#0B1120] border border-slate-700 focus:border-sky-500 rounded-lg px-3.5 py-2 font-mono text-base text-slate-100 tabular-nums focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {['50', '100', '200', '500', '1000'].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmountUsd(val)}
                className={`px-3 py-2 text-xs font-mono rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  amountUsd === val
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                    : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                ${val}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-slate-800 rounded-lg self-start md:self-auto">
          {(['ALL', 'CUP', 'MLC'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setCurrencyFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                currencyFilter === tab ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'ALL' ? 'Todas' : `Entrega ${tab}`}
            </button>
          ))}
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-semibold text-slate-100">Comparativa de Pasarelas y Remesas</h2>
          </div>
          <span className="text-xs text-slate-400">Comando /remesa {amountUsd || '100'}</span>
        </div>

        {error ? (
          <div className="p-6 text-sm text-rose-400">{error}</div>
        ) : loading && quotes.length === 0 ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-400">
                  <th className="py-3 px-6 font-medium">Pasarela / Canal</th>
                  <th className="py-3 px-4 font-medium">Tiempo</th>
                  <th className="py-3 px-4 font-medium text-right">Comisión</th>
                  <th className="py-3 px-4 font-medium text-right">Neto USD</th>
                  <th className="py-3 px-4 font-medium text-right">Tasa Efectiva</th>
                  <th className="py-3 px-6 font-medium text-right">Recibe Destinatario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {filtered.map((q) => {
                  const isBest = q.id === bestId;
                  return (
                    <tr key={q.id} className="hover:bg-slate-800/35 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-medium text-slate-100">{q.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {q.method}
                          {isBest && <span className="text-emerald-400"> · Mejor tasa neta</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-300 whitespace-nowrap">{q.deliveryTime}</td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300 tabular-nums">
                        -${q.feeUsd.toFixed(2)} ({q.feePercent}%)
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-200 tabular-nums">
                        ${q.netUsd.toFixed(2)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300 tabular-nums">
                        {q.effectiveCupRate.toFixed(2)} CUP/$
                      </td>
                      <td className="py-4 px-6 text-right font-mono font-semibold text-sky-400 tabular-nums">
                        {q.deliveredAmount.toLocaleString('es-ES')} {q.payoutCurrency}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
