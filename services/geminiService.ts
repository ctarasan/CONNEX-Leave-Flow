import { GoogleGenAI } from "@google/genai";
import { LeaveRequest } from "../types";

// OWASP: Use env variable; Vite exposes client env via import.meta.env. Do not expose server API keys to client in production.
const apiKey = typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_API_KEY
  ? import.meta.env.VITE_GEMINI_API_KEY
  : (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) || "";

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/** OWASP: Sanitize data sent to external API - limit length, no raw user HTML. */
const MAX_REASON_SNIPPET = 100;
const MAX_MONTH_LENGTH = 50;

function sanitizeForPrompt(text: string, maxLen: number): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export const generateMonthlySummary = async (requests: LeaveRequest[], month: string): Promise<string> => {
  if (!ai) {
    return "ไม่สามารถเชื่อมต่อบริการ AI ได้ (ไม่ได้ตั้งค่า API Key)";
  }
  const safeMonth = sanitizeForPrompt(month, MAX_MONTH_LENGTH);
  const statsString = JSON.stringify(
    requests.slice(0, 500).map((r) => ({
      user: sanitizeForPrompt(r.userName, 80),
      type: r.type,
      days: `${r.startDate} to ${r.endDate}`,
      status: r.status,
      reason: sanitizeForPrompt(r.reason, MAX_REASON_SNIPPET),
    }))
  );

  const prompt = `
    Analyze the following leave requests for the month of ${safeMonth}.
    Provide a professional summary in Thai language for the manager.
    Focus on:
    1. Overall leave trends (which type is most common).
    2. Any potential red flags (multiple employees out at once).
    3. A brief "Manager's Advice" section.

    Data: ${statsString}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    return response.text ?? "ไม่สามารถดึงข้อมูลสรุปจาก AI ได้ในขณะนี้";
  } catch {
    // OWASP: Do not log error details (may contain sensitive data). Use generic message.
    return "เกิดข้อผิดพลาดในการประมวลผลสรุปด้วย AI";
  }
};
