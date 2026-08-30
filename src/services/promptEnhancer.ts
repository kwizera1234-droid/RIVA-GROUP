import { isAIConfigured } from './aiAgent';

const ENHANCE_SYSTEM_PROMPT = `
You are a prompt enhancement assistant for SoberWatch, a voice-first alcohol-safety and health-monitoring app.

Your job: rewrite the user's raw prompt into a clearer, more specific, and more actionable version while preserving their original intent and language.

Rules:
- Keep the same language the user wrote in (Kinyarwanda, English, French, Swahili).
- Do NOT change the core request. If they ask for help, keep it a help request. If they ask about heart rate, keep it about heart rate.
- Add only relevant SoberWatch context when it clarifies intent: biometrics (BAC, heart rate, SpO2, temperature), emergency contacts, driving readiness, location, alerts, or reports.
- If the original is ambiguous and the action is dangerous (calling, sharing location, emergency), add a clarification note at the end in parentheses, e.g. "(clarify contact name before calling)".
- Keep the enhanced prompt concise. It should be 1-2 sentences at most.
- NEVER fabricate sensor readings, contacts, or locations. Only add context that makes the request more precise.
- Output ONLY the enhanced prompt text. No explanations, no quotes, no markdown.
`.trim();

let genInstance: Promise<unknown> | null = null;
function getGenAI() {
  if (genInstance) return genInstance;
  genInstance = import('@google/genai').then((m) => {
    const { GoogleGenAI } = m as { GoogleGenAI: new (opts: { apiKey: string }) => unknown };
    return new GoogleGenAI({ apiKey: (import.meta as unknown as { env?: Record<string, string | undefined> })?.env?.VITE_GEMINI_API_KEY || '' });
  });
  return genInstance;
}

export async function enhancePrompt(rawText: string): Promise<string> {
  if (!isAIConfigured() || !rawText.trim()) {
    return rawText;
  }

  try {
    const mod = await getGenAI();
    const ai = (mod as unknown as { models: unknown }).models;
    const generate = (ai as unknown as {
      generateContent: (opts: {
        model: string;
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        systemInstruction?: { parts: Array<{ text: string }> };
        config?: { temperature: number };
      }) => Promise<{ text?: string }>;
    }).generateContent.bind(ai);

    const response = await generate({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: rawText }] }],
      systemInstruction: { parts: [{ text: ENHANCE_SYSTEM_PROMPT }] },
      config: { temperature: 0.3 },
    });

    const enhanced = response.text?.trim();
    return enhanced && enhanced.length > 0 ? enhanced : rawText;
  } catch (err) {
    console.warn('[PromptEnhancer] Enhancement failed, returning original:', err);
    return rawText;
  }
}
