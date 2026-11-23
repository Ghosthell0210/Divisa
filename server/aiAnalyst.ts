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

  const fiatSummary = snapshot.fiatRates
    .map((f) => `${f.code}: ${f.rateToCup} CUP (${f.change24h >= 0 ? '+' : ''}${f.change24h}%, fuente: ${f.source})`)
    .join('\n');

  const cryptoSummary = snapshot.cryptoAssets
    .map((c) => `${c.symbol}: $${c.priceUsd.toLocaleString('en-US')} USD / ${c.priceCup.toLocaleString('en-US')} CUP (${c.change24h >= 0 ? '+' : ''}${c.change24h}%)`)
    .join('\n');

  const prompt = `Contexto actual del mercado (${snapshot.updatedAt}):
Divisas en Cuba (El Toque / Respaldo):
${fiatSummary}

Criptomonedas principales:
${cryptoSummary}

Consulta del usuario: "${userQuestion.trim() || 'Dame un resumen breve del mercado cambiario y cripto hoy.'}"

Responde en español claro, directo y conciso (máximo 140 palabras), optimizado para lectura rápida en Telegram. Incluye cifras exactas del contexto cuando sea relevante y una nota breve de prudencia cambiaria sin rodeos.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Eres un analista financiero conciso especializado en el mercado cambiario informal cubano (El Toque: USD, EUR, MLC, CUP) y criptomonedas. Das respuestas prácticas, directas, con formato limpio y sin relleno.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('El modelo no devolvió contenido en la respuesta.');
  }
  return text;
}
