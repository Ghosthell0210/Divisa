import React, { useEffect, useRef, useState } from 'react';
import { Send, Terminal } from 'lucide-react';
import type { BotInlineButton, BotSimulatedReply } from '../types/market';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  buttons?: BotInlineButton[][];
  timestamp: string;
  latencyMs?: number;
}

const QUICK_COMMANDS = [
  { label: '/toque', cmd: '/toque' },
  { label: '/cripto', cmd: '/cripto' },
  { label: '/convertir 100 USD CUP', cmd: '/convertir 100 USD CUP' },
  { label: '/convertir 0.05 BTC CUP', cmd: '/convertir 0.05 BTC CUP' },
  { label: '/remesa 150', cmd: '/remesa 150' },
  { label: '/ia análisis rápido', cmd: '/ia Dame un análisis breve del mercado hoy' },
];

export const TelegramSimulator: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [lastPayload, setLastPayload] = useState<BotSimulatedReply | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sendCommand = async (cmd: string, displayLabel?: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: displayLabel ?? trimmed,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const res = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      });
      const data = (await res.json()) as BotSimulatedReply & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Error ejecutando comando');
      }
      setLastPayload(data);
      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'bot',
        text: data.text,
        buttons: data.buttons,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        latencyMs: data.latencyMs,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          text: err instanceof Error ? err.message : 'Error de comunicación con el servidor del bot.',
          timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void sendCommand('/start');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Telegram Chat Window */}
      <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl flex flex-col h-[640px] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4 bg-[#0F172A]">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">CambioCubano Bot · Simulador En Vivo</h2>
            <p className="text-xs text-slate-400">Ejecuta el mismo router de comandos que Telegram en Altare</p>
          </div>
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">Telegraf Engine</span>
        </div>

        {/* Quick Command Chips */}
        <div className="px-4 py-2.5 border-b border-slate-800/80 bg-[#0B1120] flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => void sendCommand(q.cmd)}
              className="px-2.5 py-1 text-xs font-mono rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-300 transition-colors whitespace-nowrap shrink-0"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0B1120]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-4 py-3 text-sm ${
                  msg.sender === 'user'
                    ? 'bg-sky-600 text-white'
                    : 'bg-[#111827] border border-slate-800 text-slate-100'
                }`}
              >
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{msg.text}</pre>
                <div className="mt-2 flex items-center justify-end gap-2 text-[11px] opacity-75 font-mono">
                  {msg.latencyMs !== undefined && <span>{msg.latencyMs}ms</span>}
                  <span>{msg.timestamp}</span>
                </div>
              </div>

              {msg.sender === 'bot' && msg.buttons && msg.buttons.length > 0 && (
                <div className="mt-1.5 max-w-[88%] w-full sm:w-auto space-y-1.5">
                  {msg.buttons.map((row, rIdx) => (
                    <div key={rIdx} className="grid grid-cols-2 gap-1.5">
                      {row.map((btn) => (
                        <button
                          key={btn.callbackData}
                          type="button"
                          onClick={() => void sendCommand(btn.callbackData, btn.text)}
                          className="px-3 py-2 text-xs font-medium rounded-lg bg-[#1E293B] hover:bg-slate-700 border border-slate-700 text-slate-100 transition-colors whitespace-nowrap"
                        >
                          {btn.text}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const val = input;
            setInput('');
            void sendCommand(val);
          }}
          className="p-3 border-t border-slate-800 bg-[#0F172A] flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un comando (/toque, /convertir 50 EUR CUP, BTC)..."
            className="flex-1 bg-[#0B1120] border border-slate-700 focus:border-sky-500 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 font-mono focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-medium text-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar
          </button>
        </form>
      </div>

      {/* Command Reference & Payload Inspector */}
      <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-sky-400" />
            <h3 className="text-base font-semibold text-slate-100">Diccionario de Comandos Rápidos</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Comandos diseñados para consultas en menos de 1 segundo desde cualquier chat de Telegram.
          </p>

          <dl className="mt-5 divide-y divide-slate-800/80 text-sm">
            {[
              { cmd: '/toque  o  /precio', desc: 'Tabla completa de USD, EUR, MLC, Zelle, CAD y Clásica en CUP.' },
              { cmd: '/cripto', desc: 'Cotización spot de BTC, ETH, USDT, SOL, BNB y TON en USD y CUP.' },
              { cmd: '/convertir <cant> <de> <a>', desc: 'Ej: /convertir 200 EUR CUP o /convertir 0.02 BTC CUP.' },
              { cmd: '/remesa <monto_usd>', desc: 'Compara el neto recibido por Binance Pay, Zelle, TropiPay y Bizum.' },
              { cmd: '/ia <consulta>', desc: 'Resumen cambiario o pregunta libre procesada por Gemini.' },
              { cmd: 'USD  /  BTC  /  MLC', desc: 'Consulta directa escribiendo solo el código de la moneda.' },
            ].map((item) => (
              <div key={item.cmd} className="py-3">
                <dt className="font-mono text-xs font-semibold text-sky-400">{item.cmd}</dt>
                <dd className="text-xs text-slate-300 mt-1">{item.desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-[#0B1120] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Última ejecución del router</span>
            <span className="font-mono tabular-nums">{lastPayload ? `${lastPayload.latencyMs} ms` : '—'}</span>
          </div>
          <pre className="text-xs font-mono text-slate-300 overflow-x-auto">
            {lastPayload
              ? JSON.stringify(
                  {
                    commandUsed: lastPayload.commandUsed,
                    inlineRows: lastPayload.buttons.length,
                    latencyMs: lastPayload.latencyMs,
                  },
                  null,
                  2
                )
              : 'Esperando ejecución...'}
          </pre>
        </div>
      </div>
    </div>
  );
};
