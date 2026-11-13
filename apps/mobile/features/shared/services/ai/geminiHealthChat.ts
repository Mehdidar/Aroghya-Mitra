import { patientConfig } from '@/features/shared/services/config';

export type AiChatMessage = {
  role: 'user' | 'model';
  text: string;
};

export type AiHealthResponse = {
  text: string;
  severity: 'mild' | 'moderate' | 'urgent';
  recommendations: string[];
};

export const geminiConfigured = (): boolean => Boolean(patientConfig.geminiApiKey);

const SYSTEM_INSTRUCTION = `You are Aroghya Mitra (Viora AI), an empathetic, expert AI health assistant for patients in India.
Provide clear, evidence-based, concise health guidance in simple language.
Always maintain a caring, professional tone.
Categorize the severity of the user's condition into one of: 'mild', 'moderate', or 'urgent'.
- 'urgent': Severe chest pain, extreme shortness of breath, sudden numbness/paralysis, severe uncontrolled bleeding, signs of stroke or anaphylaxis.
- 'moderate': High fever over 101°F, persistent vomiting, severe pain, spreading infection, cough lasting > 1 week.
- 'mild': Common colds, mild headaches, slight fatigue, minor aches, general wellness/diet inquiries.

Provide 2-4 actionable next steps or recommendations.
Always include a clear disclaimer that this is informational and not a substitute for seeing a qualified doctor.

Respond in JSON format with exactly these fields:
{
  "text": "Your helpful response here (2-4 sentences)",
  "severity": "mild" | "moderate" | "urgent",
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}`;

function fallbackResponse(message: string): AiHealthResponse {
  const lower = message.toLowerCase();
  if (
    lower.includes('chest') ||
    lower.includes('breath') ||
    lower.includes('heart attack') ||
    lower.includes('stroke') ||
    lower.includes('unconscious')
  ) {
    return {
      text: 'Chest discomfort or severe breathing difficulty requires immediate emergency medical evaluation. Please visit the nearest hospital casualty or call an ambulance right away.',
      severity: 'urgent',
      recommendations: [
        'Call 108 (India Emergency Ambulance) or visit emergency room immediately.',
        'Sit upright and rest; do not exert yourself.',
        'Keep someone nearby and unlock the front door for emergency personnel.',
      ],
    };
  }

  if (
    lower.includes('fever') ||
    lower.includes('vomit') ||
    lower.includes('cough') ||
    lower.includes('throat') ||
    lower.includes('stomach')
  ) {
    return {
      text: 'Your symptoms suggest an acute viral or digestive condition. Rest, hydrate thoroughly, and monitor your symptoms closely over the next 24-48 hours.',
      severity: 'moderate',
      recommendations: [
        'Drink plenty of fluids (boiled water, ORS, or coconut water).',
        'Monitor body temperature and pulse every 4-6 hours.',
        'Rest and take light, non-spicy meals.',
        'Consult a general physician if fever exceeds 101°F or lasts more than 3 days.',
      ],
    };
  }

  return {
    text: 'Based on what you shared, your symptoms appear mild. Getting adequate rest and monitoring how you feel over the day is generally beneficial.',
    severity: 'mild',
    recommendations: [
      'Stay hydrated with 2-3 liters of fluids today.',
      'Take rest in a quiet, comfortable space.',
      'Maintain balanced nutrition with seasonal fresh fruits and vegetables.',
      'Book a routine consultation with a doctor if symptoms do not improve.',
    ],
  };
}

export async function askHealthAI(
  message: string,
  history: AiChatMessage[] = [],
  lang: string = 'en'
): Promise<AiHealthResponse> {
  const apiKey = patientConfig.geminiApiKey;

  if (!apiKey) {
    return fallbackResponse(message);
  }

  try {
    const contents = [
      ...history.map((h) => ({
        role: h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.text }],
      })),
      {
        role: 'user',
        parts: [
          {
            text: `[User language preference: ${lang}]\nUser symptom/question: ${message}`,
          },
        ],
      },
    ];

    const body = JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 800,
        responseMimeType: 'application/json',
      },
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);

    // The key goes in a header, not the query string, so it never lands in server logs or crash reports.
    const call = (model: string) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body,
      });

    let res = await call(patientConfig.geminiModel);
    // 404: the model was retired (Google retires flash models within months). 503: overloaded.
    // One retry on the fallback alias keeps the chat alive without a release.
    if ((res.status === 404 || res.status === 503) && patientConfig.geminiFallbackModel !== patientConfig.geminiModel) {
      console.warn(`Gemini ${patientConfig.geminiModel} returned ${res.status}, retrying with ${patientConfig.geminiFallbackModel}`);
      res = await call(patientConfig.geminiFallbackModel);
    }

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`Gemini API returned status ${res.status}, using smart fallback`);
      return fallbackResponse(message);
    }

    const json = await res.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return fallbackResponse(message);
    }

    try {
      const parsed = JSON.parse(rawText) as {
        text?: string;
        severity?: 'mild' | 'moderate' | 'urgent';
        recommendations?: string[];
      };

      return {
        text: parsed.text || rawText,
        severity: parsed.severity || 'mild',
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : ['Rest and monitor your symptoms.', 'Consult a doctor if symptoms persist.'],
      };
    } catch {
      return {
        text: rawText,
        severity: 'mild',
        recommendations: ['Stay hydrated and rest.', 'Consult a doctor if symptoms persist.'],
      };
    }
  } catch (err) {
    console.warn('Error calling Gemini API:', err);
    return fallbackResponse(message);
  }
}
