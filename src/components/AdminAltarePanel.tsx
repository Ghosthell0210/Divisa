import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, Copy, Server, ShieldCheck } from 'lucide-react';
import type { BotStats, MarketSnapshot } from '../types/market';

interface AdminAltarePanelProps {
  snapshot: MarketSnapshot | null;
  onRatesUpdated: () => void;
}

const OVERRIDE_CODES = ['USD', 'EUR', 'MLC', 'USDT_TRC20', 'ZELLE', 'CLASICA'] as const;

export const AdminAltarePanel: React.FC<AdminAltarePanelProps> = ({ snapshot, onRatesUpdated }) => {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [manualEnabled, setManualEnabled] = useState<boolean>(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/bot/stats');
      if (res.ok) {
        const data = (await res.json()) as BotStats;
        setStats(data);
        setManualEnabled(data.manualModeEnabled);
      }
    } catch {
      // Ignore transient network errors
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const initial: Record<string, string> = {};
    for (const code of OVERRIDE_CODES) {
      const found = snapshot.fiatRates.find((f) => f.code === code);
      initial[code] = found?.manualOverride ? String(found.manualOverride) : String(found?.rateToCup ?? '');
    }
    setOverrides(initial);
  }, [snapshot]);

  const handleSaveOverrides = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const numericOverrides: Record<string, number | null> = {};
      for (const code of OVERRIDE_CODES) {
        const num = Number(overrides[code]);
        numericOverrides[code] = Number.isFinite(num) && num > 0 ? num : null;
      }
      const res = await fetch('/api/admin/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualModeEnabled: manualEnabled,
          overrides: numericOverrides,
        }),
      });
      if (!res.ok) throw new Error('No se pudieron guardar las tasas manuales.');
      setSaveMessage('Tasas de respaldo guardadas correctamente.');
      onRatesUpdated();
      void loadStats();
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Error guardando configuración.');
    } finally {
      setSaving(false);
    }
  };

  const testHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = (await res.json()) as { status: string; uptimeSeconds: number; memoryMb: number };
      setHealthResult(`OK · Uptime ${data.uptimeSeconds}s · Memoria ${data.memoryMb} MB`);
    } catch {
      setHealthResult('Error consultando /api/health');
    }
  };

  const copyText = (id: string, value: string) => {
    void navigator.clipboard.writeText(value);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const commandChartData = Object.entries(stats?.commandCounts ?? {})
    .map(([cmd, count]) => ({ cmd, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const runtimeLabel =
    stats?.runtime.mode === 'polling'
      ? 'Activo (Long Polling)'
      : stats?.runtime.mode === 'webhook'
        ? 'Activo (Webhook)'
        : 'Modo Simulación (Sin TELEGRAM_BOT_TOKEN)';

  return (
    <div className="space-y-6">
      {/* Bot Stats & Runtime Summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Estado del Worker Telegram</div>
          <div className="mt-2 text-base font-semibold text-slate-100">{runtimeLabel}</div>
          <div className="mt-2 text-xs text-slate-400 font-mono">
            {stats?.runtime.botUsername ?? 'Configura TELEGRAM_BOT_TOKEN'}
          </div>
        </div>
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Consultas Procesadas</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {stats?.totalQueries ?? 0}
          </div>
          <div className="mt-2 text-xs text-slate-400">Telegram + Simulador</div>
        </div>
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Usuarios Únicos</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {stats?.uniqueUsers ?? 0}
          </div>
          <div className="mt-2 text-xs text-slate-400">Histórico persistido en disco</div>
        </div>
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Salud del Servidor Altare</div>
          <div className="mt-2 text-sm font-mono text-emerald-400">
            {healthResult ?? 'Listo para verificación'}
          </div>
          <button
            type="button"
            onClick={() => void testHealth()}
            className="mt-2 text-xs font-medium text-sky-400 hover:text-sky-300"
          >
            Probar /api/health
          </button>
        </div>
      </section>

      {/* Manual Overrides + Command Popularity Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <form
          onSubmit={(e) => void handleSaveOverrides(e)}
          className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Tasas Manuales de Respaldo</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Activa este modo para fijar tus propias cotizaciones CUP sobre las fuentes externas.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={manualEnabled}
                onClick={() => setManualEnabled(!manualEnabled)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  manualEnabled
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                {manualEnabled ? 'Modo Manual Activo' : 'Usar Fuentes En Vivo'}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {OVERRIDE_CODES.map((code) => (
                <div key={code}>
                  <label htmlFor={`ovr-${code}`} className="block text-xs font-mono text-slate-400 mb-1">
                    {code} / CUP
                  </label>
                  <input
                    id={`ovr-${code}`}
                    type="number"
                    step="0.01"
                    min="1"
                    value={overrides[code] ?? ''}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [code]: e.target.value }))}
                    className="w-full bg-[#0B1120] border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 font-mono text-sm text-slate-100 tabular-nums focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-400">{saveMessage ?? 'Los cambios aplican al bot de Telegram de inmediato.'}</span>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-medium text-xs transition-colors whitespace-nowrap shrink-0"
            >
              {saving ? 'Guardando...' : 'Guardar Tasas'}
            </button>
          </div>
        </form>

        <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col">
          <h2 className="text-base font-semibold text-slate-100">Uso de Comandos del Bot</h2>
          <p className="text-xs text-slate-400 mt-0.5">Distribución acumulada por tipo de consulta</p>

          <div className="mt-4 flex-1 min-h-[220px]">
            {commandChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-slate-800 rounded-lg bg-[#0B1120]">
                Ejecuta comandos en Telegram o en el simulador para ver métricas.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commandChartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="cmd" stroke="#94A3B8" fontSize={11} fontFamily="JetBrains Mono" tickLine={false} />
                  <YAxis stroke="#64748B" fontSize={11} fontFamily="JetBrains Mono" tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontFamily: 'JetBrains Mono',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Altare Deployment Blueprint */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">Guía Lista para Despliegue en Altare</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Arquitectura unificada de proceso único: Express + SPA React compilada + Telegraf Bot Worker.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium whitespace-nowrap">
            <ShieldCheck className="w-4 h-4" />
            Listo para Node.js 22+
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: 'build',
              title: '1. Comando de Compilación',
              value: 'bun install && bun run build',
              note: 'También compatible con npm run build. Compila la interfaz en dist/ sin advertencias.',
            },
            {
              id: 'start',
              title: '2. Startup Command (Altare)',
              value: 'bun server.ts',
              note: 'Usa bun server.ts en contenedores Bun de Altare, o npm start (node server.ts) en Node 22+.',
            },
            {
              id: 'health',
              title: '3. Endpoint de Monitoreo',
              value: '/api/health',
              note: 'Responde al instante tras arrancar con uptime, RAM y estado de conexión a Telegram.',
            },
          ].map((step) => (
            <div key={step.id} className="bg-[#0B1120] border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400">{step.title}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-sky-300 truncate">{step.value}</code>
                <button
                  type="button"
                  onClick={() => copyText(step.id, step.value)}
                  className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 shrink-0"
                  aria-label={`Copiar ${step.title}`}
                >
                  {copiedKey === step.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">{step.note}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#0B1120] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-slate-300">Variables de Entorno para el Panel de Altare</span>
            <button
              type="button"
              onClick={() =>
                copyText(
                  'env',
                  'NODE_ENV=production\nPORT=3000\nTELEGRAM_BOT_TOKEN=\nELTOQUE_API_TOKEN=\nWEBHOOK_URL=\nADMIN_CHAT_ID='
                )
              }
              className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
            >
              {copiedKey === 'env' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'env' ? 'Copiado' : 'Copiar plantilla'}
            </button>
          </div>
          <pre className="text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">{`NODE_ENV=production
PORT=3000
TELEGRAM_BOT_TOKEN=<token_de_botfather>
ELTOQUE_API_TOKEN=<opcional_token_de_tasas_eltoque_com>
WEBHOOK_URL=<opcional_si_prefieres_webhook_en_lugar_de_polling>
ADMIN_CHAT_ID=<opcional_tu_id_telegram>`}</pre>
          <p className="mt-2 text-xs text-slate-400">
            Si dejas <code className="text-slate-200">WEBHOOK_URL</code> vacío en Altare, el bot inicia automáticamente en modo Long Polling sin necesitar configuración adicional de dominio SSL.
          </p>
        </div>
      </section>

      {/* Recent Logs Table */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Registro Reciente de Consultas</h2>
          <button
            type="button"
            onClick={() => void loadStats()}
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            Refrescar historial
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-3 px-6 font-medium">Hora</th>
                <th className="py-3 px-4 font-medium">Origen</th>
                <th className="py-3 px-4 font-medium">Usuario</th>
                <th className="py-3 px-4 font-medium">Comando</th>
                <th className="py-3 px-6 font-medium text-right">Latencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {(stats?.recentLogs ?? []).slice(0, 10).map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/35">
                  <td className="py-3 px-6 font-mono text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString('es-ES')}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {log.origin === 'telegram' ? 'Telegram' : 'Simulador Web'}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-200">{log.username}</td>
                  <td className="py-3 px-4 font-mono text-sky-300">{log.command}</td>
                  <td className="py-3 px-6 text-right font-mono text-slate-400 tabular-nums">{log.latencyMs} ms</td>
                </tr>
              ))}
              {(!stats || stats.recentLogs.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    Aún no hay consultas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
