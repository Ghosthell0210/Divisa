import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import type { HistoricalPoint, HistoricalSeriesResponse, MarketSnapshot, TimeRange } from '../types/market';

interface ChartsPanelProps {
  snapshot: MarketSnapshot | null;
  selectedSymbol: string;
  onSelectSymbol: (sym: string) => void;
}

const CHART_ASSETS = [
  { symbol: 'BTC', label: 'BTC / USD', group: 'Cripto' },
  { symbol: 'ETH', label: 'ETH / USD', group: 'Cripto' },
  { symbol: 'SOL', label: 'SOL / USD', group: 'Cripto' },
  { symbol: 'TON', label: 'TON / USD', group: 'Cripto' },
  { symbol: 'BNB', label: 'BNB / USD', group: 'Cripto' },
  { symbol: 'USD', label: 'USD / CUP', group: 'Divisas' },
  { symbol: 'EUR', label: 'EUR / CUP', group: 'Divisas' },
  { symbol: 'MLC', label: 'MLC / CUP', group: 'Divisas' },
  { symbol: 'USDT_TRC20', label: 'USDT Cuba / CUP', group: 'Divisas' },
  { symbol: 'ZELLE', label: 'ZELLE / CUP', group: 'Divisas' },
];

export const ChartsPanel: React.FC<ChartsPanelProps> = ({
  snapshot,
  selectedSymbol,
  onSelectSymbol,
}) => {
  const [range, setRange] = useState<TimeRange>('7D');
  const [points, setPoints] = useState<HistoricalPoint[]>([]);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async (sym: string, r: TimeRange) => {
    setLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const res = await fetch(`/api/history/${encodeURIComponent(sym)}?range=${r}`);
      const data = (await res.json()) as HistoricalSeriesResponse & { error?: string };
      if (!res.ok || !Array.isArray(data.points)) {
        throw new Error(data.error ?? 'Error cargando serie histórica real');
      }
      setPoints(data.points);
      setInfoMessage(data.message ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la gráfica');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory(selectedSymbol, range);
  }, [selectedSymbol, range]);

  const isFiat = useMemo(
    () =>
      snapshot?.fiatRates.some((f) => f.code === selectedSymbol) ??
      ['USD', 'EUR', 'MLC', 'USDT_TRC20', 'ZELLE', 'CAD', 'MXN', 'CLASICA'].includes(selectedSymbol),
    [snapshot, selectedSymbol]
  );

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const first = values[0];
    const last = values[values.length - 1];
    const max = Math.max(...values);
    const min = Math.min(...values);
    const pct = first > 0 ? ((last - first) / first) * 100 : 0;
    return { last, max, min, pct };
  }, [points]);

  const unit = isFiat ? 'CUP' : 'USD';

  return (
    <div className="space-y-6">
      {/* Asset & Timeframe Controls */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {CHART_ASSETS.map((asset) => {
            const active = selectedSymbol === asset.symbol;
            return (
              <button
                key={asset.symbol}
                type="button"
                onClick={() => onSelectSymbol(asset.symbol)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-sky-500 text-slate-950 border-sky-400'
                    : 'bg-[#0B1120] text-slate-300 border-slate-800 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                {asset.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-slate-800 rounded-lg self-start lg:self-auto">
          {(['24H', '7D', '30D'] as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                range === r ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chart Surface */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="text-xs text-slate-400">
              Serie histórica real · {isFiat ? 'Capturas reales acumuladas de elTOQUE' : 'Velas y precios reales CoinGecko / Binance'}
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <h2 className="text-2xl font-bold text-slate-100 font-mono tabular-nums">
                {stats
                  ? isFiat
                    ? `${stats.last.toLocaleString('es-ES', { maximumFractionDigits: 2 })} CUP`
                    : `$${stats.last.toLocaleString('en-US', { maximumFractionDigits: stats.last < 10 ? 4 : 2 })} USD`
                  : 'Sin lecturas'}
              </h2>
              {stats && points.length >= 2 && (
                <span
                  className={`font-mono text-sm font-medium tabular-nums ${
                    stats.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {stats.pct >= 0 ? '+' : ''}
                  {stats.pct.toFixed(2)}% ({range})
                </span>
              )}
            </div>
          </div>

          {stats && points.length >= 2 && (
            <div className="flex items-center gap-6 text-xs">
              <div>
                <span className="text-slate-400 block">Máximo {range}</span>
                <span className="font-mono text-sm text-slate-100 tabular-nums">
                  {isFiat ? `${stats.max.toFixed(2)} CUP` : `$${stats.max.toLocaleString('en-US')}`}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Mínimo {range}</span>
                <span className="font-mono text-sm text-slate-100 tabular-nums">
                  {isFiat ? `${stats.min.toFixed(2)} CUP` : `$${stats.min.toLocaleString('en-US')}`}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 h-[360px] w-full">
          {loading ? (
            <div className="h-full w-full bg-[#0B1120] border border-slate-800/80 rounded-lg animate-pulse" />
          ) : error ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-[#0B1120] border border-slate-800 rounded-lg p-6 text-center">
              <p className="text-sm text-rose-400">{error}</p>
              <button
                type="button"
                onClick={() => void loadHistory(selectedSymbol, range)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reintentar
              </button>
            </div>
          ) : points.length < 2 ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-[#0B1120] border border-slate-800 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-slate-200 max-w-lg">
                {infoMessage ?? `No hay suficientes puntos históricos reales para graficar ${selectedSymbol}.`}
              </p>
              {points.length === 1 && (
                <div className="font-mono text-xs text-sky-400">
                  Última captura real: {points[0].value.toLocaleString('es-ES')} {unit} ·{' '}
                  {new Date(points[0].timestamp).toLocaleString('es-ES')}
                </div>
              )}
              <button
                type="button"
                onClick={() => void loadHistory(selectedSymbol, range)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg mt-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Actualizar serie
              </button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  fontFamily="JetBrains Mono"
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={68}
                  fontFamily="JetBrains Mono"
                  tickFormatter={(v: number) =>
                    isFiat ? `${v}` : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontFamily: 'JetBrains Mono',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
                  formatter={(value: unknown) => {
                    const num = Number(value ?? 0);
                    return [
                      isFiat
                        ? `${num.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${unit}`
                        : `$${num.toLocaleString('en-US', { maximumFractionDigits: num < 10 ? 4 : 2 })} ${unit}`,
                      selectedSymbol,
                    ];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#38BDF8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#rateGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
