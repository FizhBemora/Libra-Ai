
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Message, Settings } from '../types';
import { LIBRA_CORE_PROMPT } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateResponse(
  messages: Message[],
  settings: Settings
): Promise<{ text: string; metadata: any }> {
  let modelName = 'gemini-3-pro-preview';
  
  if (settings.mapsGrounding) {
    modelName = 'gemini-2.5-flash-latest';
  }

  const systemInstruction = LIBRA_CORE_PROMPT
    .replace('{intensity}', settings.intensity.toString())
    .replace('{focus}', settings.focus);

  const config: any = {
    systemInstruction,
    thinkingConfig: { thinkingBudget: settings.intensity > 5 ? 3000 : 1000 },
  };

  const tools: any[] = [];
  if (settings.searchGrounding) tools.push({ googleSearch: {} });
  
  if (settings.mapsGrounding) {
    tools.push({ googleMaps: {} });
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
      
      config.toolConfig = {
        retrievalConfig: {
          latLng: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        }
      };
    } catch (e) { console.warn("Geo skipped."); }
  }
  
  if (tools.length > 0) config.tools = tools;

  const contents = messages.map(m => ({
    role: m.role,
    parts: m.parts.map(p => {
      if (p.inlineData) return { inlineData: p.inlineData };
      return { text: p.text };
    })
  }));

  try {
    const startTime = Date.now();
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    const endTime = Date.now();
    const text = response.text || "Logika saya saat ini melampaui medium ini.";
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const groundingUrls = groundingChunks?.map((chunk: any) => {
      if (chunk.web) return { uri: chunk.web.uri, title: chunk.web.title };
      if (chunk.maps) return { uri: chunk.maps.uri, title: chunk.maps.title };
      return null;
    }).filter((u: any) => u && u.uri) || [];

    let audioData = '';
    // Meningkatkan limit karakter TTS agar teks panjang tetap bisa bersuara (hingga 2000 karakter)
    if (settings.ttsEnabled && !settings.silentMode && text.length < 2000) {
      try {
        audioData = await generateSpeech(text);
      } catch (e) { console.error("TTS failed", e); }
    }

    return {
      text,
      metadata: {
        latency: endTime - startTime,
        groundingUrls,
        thinking: (response as any).candidates?.[0]?.content?.parts?.find((p: any) => p.thought)?.text,
        audioData
      }
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

export async function generateSpeech(text: string): Promise<string> {
  // Menggunakan prompt yang lebih spesifik untuk membantu aksentuasi Bahasa Indonesia
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Bacakan dengan nada tenang dan intelektual dalam Bahasa Indonesia: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { 
          // 'Zephyr' atau 'Kore' biasanya paling stabil untuk multilingual
          prebuiltVoiceConfig: { voiceName: 'Zephyr' } 
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
}

export async function generateImage(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: `Visualisasi filosofis abstrak dan megah: ${prompt}` }] },
  });
  const imgPart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  return imgPart?.inlineData?.data || '';
}

export async function detectBias(text: string): Promise<string> {
  if (text.length < 10) return "Tidak ada";
  const model = 'gemini-3-flash-preview';
  const prompt = `Identifikasi satu kesalahan logika (fallacy) paling dominan dalam input ini. Jawab hanya namanya dalam Bahasa Indonesia. Jika tidak ada, jawab 'Tidak ada'. Input: "${text}"`;
  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    return response.text?.trim() || "Tidak ada";
  } catch { return "Tidak ada"; }
}

export async function generateQuiz(messages: Message[]): Promise<any[]> {
  const context = messages.slice(-5).map(m => m.parts[0].text).join('\n');
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Berdasarkan konteks percakapan ini:\n${context}\n\nBuatlah 3 pertanyaan logika yang menantang dalam format JSON (Bahasa Indonesia).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ['type', 'question', 'options', 'correctAnswer', 'explanation']
        }
      }
    }
  });
  return JSON.parse(response.text || '[]');
}
