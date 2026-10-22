import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('WARNING: GEMINI_API_KEY is not set in environment or .env file');
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Fast Flash model as requested
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const REQUEST_TIMEOUT_MS = 30000; // 30-second timeout

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Detects 429 or quota exhaustion errors from the API
 */
export function isQuotaOrRateLimitError(err: any): boolean {
  const msg = (err?.message || String(err)).toLowerCase();
  const status = String(err?.status || err?.code || '');
  return (
    status === '429' ||
    status === 'RESOURCE_EXHAUSTED' ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('exceeded your current quota')
  );
}

/**
 * Wraps a promise with a 30-second timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`LLM call timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);

    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Single entry point for all LLM calls.
 * Enforces:
 * - Fast Flash model
 * - Short output limit (800 tokens max)
 * - Low thinking budget (or 0)
 * - 30 second timeout
 * - At most 1 retry on transient failures
 * - Immediate abort on 429/quota errors (no silent retrying)
 */
export async function generateTextWithGemini(
  prompt: string,
  systemInstruction?: string,
  modelName: string = DEFAULT_MODEL
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. Please set it in your .env file.');
  }

  const buildConfig = (targetModel: string) => {
    const config: any = {
      maxOutputTokens: 800, // Short output limit
    };

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    // Set thinking budget for models supporting thinking
    if (targetModel.includes('3.8-flash') || targetModel.includes('2.5-flash-preview')) {
      config.thinkingConfig = { thinkingBudget: 0 };
    }

    return config;
  };

  const executeCall = async (model: string): Promise<string> => {
    const config = buildConfig(model);
    const callPromise = ai.models.generateContent({
      model,
      contents: prompt,
      config,
    });

    const response = await withTimeout(callPromise, REQUEST_TIMEOUT_MS);
    return response.text?.trim() || '';
  };

  // Attempt 1 with primary model
  try {
    return await executeCall(modelName);
  } catch (err: any) {
    // Check for 429 / quota error: STOP IMMEDIATELY, DO NOT RETRY SILENTLY
    if (isQuotaOrRateLimitError(err)) {
      const quotaMsg = `API Quota / Rate Limit Exceeded (HTTP 429): ${err?.message || 'Daily/per-minute request limit reached'}. Stopped immediately without silent retries.`;
      console.error(`[LLM Quota Error] ${quotaMsg}`);
      throw new QuotaExceededError(quotaMsg);
    }

    console.warn(`[LLM] Attempt 1 on ${modelName} failed (${err?.message || err}). Attempting at most 1 retry...`);

    // At most 1 retry on transient error (using fallback model if primary errored)
    try {
      const retryModel = modelName === DEFAULT_MODEL ? FALLBACK_MODEL : modelName;
      return await executeCall(retryModel);
    } catch (retryErr: any) {
      if (isQuotaOrRateLimitError(retryErr)) {
        const quotaMsg = `API Quota / Rate Limit Exceeded (HTTP 429): ${retryErr?.message || 'Daily/per-minute request limit reached'}. Stopped immediately without silent retries.`;
        console.error(`[LLM Quota Error on Retry] ${quotaMsg}`);
        throw new QuotaExceededError(quotaMsg);
      }
      throw new Error(`LLM call failed after 1 retry: ${retryErr?.message || retryErr}`);
    }
  }
}

/**
 * Draft a Playwright spec file with strict adherence to Playwright best practices.
 * Uses at most ONE LLM call.
 */
export async function draftSpecWithLLM(params: {
  testId: string;
  flowDescription: string;
  expectedEndState: string;
  targetUrl: string;
  reasonedDecisions: Array<{ stepDescription: string; chosenSelector: string; strategy: string; reason: string }>;
  syntheticData: { username: string; email: string; password: string };
  onlyCheckUrlMock?: boolean;
}): Promise<string> {
  const systemPrompt = `You are an expert Playwright TypeScript test automation engineer.
Write a concise, robust Playwright test spec.
Rules:
1. Always import { test, expect } from '@playwright/test'.
2. Use synthetic credentials: username: "${params.syntheticData.username}", email: "${params.syntheticData.email}", password: "${params.syntheticData.password}".
3. Prefer user-facing locators: page.getByRole, page.getByPlaceholder.
4. Target URL: "${params.targetUrl}".
5. ${params.onlyCheckUrlMock ? 'Assert ONLY that the page URL changes to "/", with no DOM state assertion.' : 'Must assert authenticated DOM state: expect(page.getByRole(\'link\', { name: \'' + params.syntheticData.username + '\' })).toBeVisible({ timeout: 15000 }).'}
6. Return ONLY clean TypeScript code without markdown code blocks.`;

  const userPrompt = `Test ID: ${params.testId}
Flow: ${params.flowDescription}
Expected End State: ${params.expectedEndState}
Reasoned Selectors:
${JSON.stringify(params.reasonedDecisions, null, 2)}`;

  const rawCode = await generateTextWithGemini(userPrompt, systemPrompt);
  let cleanCode = rawCode.replace(/^```(?:typescript|ts)?\r?\n/i, '').replace(/\r?\n```$/i, '').trim();
  return cleanCode;
}
