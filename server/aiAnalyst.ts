import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getMarketSnapshot } from './ratesEngine.ts';

let cachedClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno del servidor.');
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export async function generateMarketAnalysis(userQuestion: string): Promise<string> {
  const snapshot = await getMarketSnapshot(false);
  const ai = getAiClient();

  const fiatSummary =
    snapshot.fiatRates.length > 0
      ? snapshot.fiatRates
          .map((f) => {
            const varText = f.change24h !== null ? ` (${f.change24h >= 0 ? '+' : ''}${f.change24h}%)` : '';
            return `${f.code}: ${f.rateToCup} CUP${varText} [fuente: ${f.source}]`;
          })
          .join('\n')
      : `Sin tasas reales de El Toque disponibles (${snapshot.elToqueError ?? 'error de fuente'}).`;

  const cryptoSummary =
    snapshot.cryptoAssets.length > 0
      ? snapshot.cryptoAssets
          .map((c) => {
            const cupText = c.priceCup !== null ? ` / ${Math.round(c.priceCup).toLocaleString('en-US')} CUP` : '';
            return `${c.symbol}: $${c.priceUsd.toLocaleString('en-US')} USD${cupText} (${c.change24h >= 0 ? '+' : ''}${c.change24h}%)`;
          })
          .join('\n')
      : `Sin cotizaciones cripto disponibles (${snapshot.cryptoError ?? 'error de fuente'}).`;

  const prompt = `Contexto real del mercado (${snapshot.updatedAt}):
Divisas en Cuba (elTOQUE):
${fiatSummary}

Criptomonedas principales:
${cryptoSummary}

Consulta del usuario: "${userQuestion.trim() || 'Dame un resumen breve del mercado cambiario y cripto hoy.'}"

Responde en español claro, directo y conciso (máximo 140 palabras), optimizado para lectura rápida en Telegram. Usa únicamente las cifras reales del contexto (si falta algún dato, dilo abiertamente y no inventes números).`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Eres un analista financiero conciso especializado en el mercado cambiario informal cubano (elTOQUE: USD, EUR, MLC, CUP) y criptomonedas. Nunca inventas precios ni tasas.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('El modelo no devolvió contenido en la respuesta.');
  }
  return text;
}
