import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bot,
  Calculator,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Server,
  X,
} from 'lucide-react';
import type { MarketSnapshot } from './types/market';
import { OverviewPanel } from './components/OverviewPanel';
import { TelegramSimulator } from './components/TelegramSimulator';
import { RemittancesPanel } from './components/RemittancesPanel';

const ChartsPanel = lazy(() =>
  import('./components/ChartsPanel').then((m) => ({ default: m.ChartsPanel }))
);
const AdminAltarePanel = lazy(() =>
  import('./components/AdminAltarePanel').then((m) => ({ default: m.AdminAltarePanel }))
);

type NavTab = 'overview' | 'charts' | 'simulator' | 'remittances' | 'admin';

const NAV_ITEMS: Array<{ id: NavTab; label: string; breadcrumb: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Resumen y Conversor', breadcrumb: 'Mercado / Resumen y Conversor', icon: LayoutDashboard },
  { id: 'charts', label: 'Gráficos y Mercados', breadcrumb: 'Mercado / Gráficos Históricos', icon: BarChart3 },
  { id: 'simulator', label: 'Simulador Telegram', breadcrumb: 'Bot / Simulador de Comandos', icon: Bot },
  { id: 'remittances', label: 'Remesas y Pasarelas', breadcrumb: 'Pagos / Calculadora de Remesas', icon: Calculator },
  { id: 'admin', label: 'Admin y Altare', breadcrumb: 'Despliegue / Administración Altare', icon: Server },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chartSymbol, setChartSymbol] = useState<string>('USD');

  const fetchRates = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading((prev) => prev && !snapshot);
    setError(null);

    try {
      const res = await fetch(`/api/rates${force ? '?force=true' : ''}`);
      const data = (await res.json()) as MarketSnapshot & { error?: string };
      if (data && Array.isArray(data.fiatRates) && Array.isArray(data.cryptoAssets)) {
        setSnapshot(data);
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Error cargando cotizaciones reales');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con la API de cotizaciones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [snapshot]);

  useEffect(() => {
    void fetchRates(false);
    const interval = setInterval(() => {
      void fetchRates(false);
    }, 90_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectAssetForChart = (symbol: string) => {
    setChartSymbol(symbol);
    setActiveTab('charts');
  };

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const fiatSourceLabel = !snapshot
    ? '—'
    : snapshot.elToqueSource === 'live'
      ? 'En vivo'
      : snapshot.elToqueSource === 'search-grounded'
        ? 'Google Search'
        : snapshot.elToqueSource === 'manual'
          ? 'Manual'
          : snapshot.elToqueSource === 'stale'
            ? 'Último dato real'
            : 'No disponible';

  const cryptoSourceLabel = !snapshot
    ? '—'
    : snapshot.cryptoSource === 'live'
      ? 'En vivo'
      : snapshot.cryptoSource === 'stale'
        ? 'Último dato real'
        : 'No disponible';

  const sourceSummary = snapshot
    ? `elTOQUE (${fiatSourceLabel}) · Cripto (${cryptoSourceLabel}) · ${new Date(snapshot.updatedAt).toLocaleTimeString('es-ES')}`
    : 'Sincronizando cotizaciones reales...';

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0F172A] border-r border-slate-800">
        <div className="h-16 px-6 flex items-center border-b border-slate-800">
          <span className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            CambioCubano
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-500/12 text-sky-300 border border-sky-500/25'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>USD Cuba</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {snapshot ? `${snapshot.fiatRates.find((f) => f.code === 'USD')?.rateToCup.toFixed(0)} CUP` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>BTC Spot</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {snapshot
                ? `$${Math.round(snapshot.cryptoAssets.find((c) => c.symbol === 'BTC')?.priceUsd ?? 0).toLocaleString('en-US')}`
                : '—'}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
            Bot Telegram + Consola Altare
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] bg-[#0F172A] border-r border-slate-800 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
              <span className="font-display text-lg font-bold text-slate-100 whitespace-nowrap">
                CambioCubano
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-sky-500/12 text-sky-300 border border-sky-500/25'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract (3 zones) */}
        <header className="sticky top-0 z-30 h-16 bg-[#0B1120]/95 backdrop-blur border-b border-slate-800 px-4 sm:px-8 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir navegación"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold text-slate-100 truncate">{activeNav.breadcrumb}</h1>
          </div>

          <div className="hidden md:block text-xs text-slate-400 truncate">
            {sourceSummary}
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => void fetchRates(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-medium text-xs transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando...' : 'Actualizar Tasas'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1360px] w-full mx-auto">
          {error && (
            <div className="mb-6 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-sm text-rose-300">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void fetchRates(true)}
                className="text-xs font-medium underline hover:text-rose-200 whitespace-nowrap"
              >
                Reintentar
              </button>
            </div>
          )}

          <Suspense
            fallback={
              <div className="h-72 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />
            }
          >
            {activeTab === 'overview' && (
              <OverviewPanel
                snapshot={snapshot}
                loading={loading}
                onSelectAssetForChart={handleSelectAssetForChart}
              />
            )}
            {activeTab === 'charts' && (
              <ChartsPanel
                snapshot={snapshot}
                selectedSymbol={chartSymbol}
                onSelectSymbol={setChartSymbol}
              />
            )}
            {activeTab === 'simulator' && <TelegramSimulator />}
            {activeTab === 'remittances' && <RemittancesPanel />}
            {activeTab === 'admin' && (
              <AdminAltarePanel snapshot={snapshot} onRatesUpdated={() => void fetchRates(false)} />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
