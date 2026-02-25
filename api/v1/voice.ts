/**
 * Voice Command Processing API
 * Proxies voice commands to LLM API for natural language understanding
 * Supports OpenAI (default) and Anthropic providers
 *
 * POST /api/v1/voice
 * Body: { transcript: string, context: VoiceContext }
 * Returns: VoiceIntent
 *
 * Environment Variables:
 * - VOICE_LLM_PROVIDER: 'openai' (default) or 'anthropic'
 * - OPENAI_API_KEY: Required if using OpenAI
 * - ANTHROPIC_API_KEY: Required if using Anthropic
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAuth } from '../lib/jwt.js';
import {
  handlePreflight,
  sendSuccess,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sendRateLimitExceeded,
  sendAuthRequired,
  sanitizeString
} from '../lib/response.js';
import { getRedis, hasRedisError, CLIENT_PIN_KEY } from '../lib/redis.js';
import { apiLogger } from '../lib/apiLogger.js';

// Configuration
const MAX_TOKENS = 256;

// Rate limiting configuration (voice API is expensive)
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 voice requests per minute per IP

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  error?: string;
}

interface VoiceContext {
  role: 'timer' | 'gateJudge';
  language: 'de' | 'en';
  currentRun?: number;
  activeBibs?: string[];
  gateRange?: [number, number];
  pendingConfirmation?: {
    action: string;
    params: Record<string, unknown>;
  } | null;
}

interface VoiceRequestBody {
  transcript?: string;
  context?: VoiceContext;
}

interface VoiceIntent {
  action: string;
  confidence: number;
  params?: Record<string, unknown>;
  confirmationNeeded?: boolean;
  confirmationPrompt?: string;
  error?: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface ProviderConfig {
  url: string;
  model: string;
  envKey: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface AnthropicResponse {
  content?: Array<{ text?: string }> | string;
}

/**
 * Check rate limit for voice API
 */
async function checkRateLimit(clientIP: string): Promise<RateLimitResult> {
  let client: ReturnType<typeof getRedis>;
  try {
    client = getRedis();
  } catch {
    apiLogger.error('Rate limiting unavailable - denying voice request');
    return { allowed: false, remaining: 0, error: 'Service temporarily unavailable' };
  }
  if (hasRedisError()) {
    apiLogger.error('Rate limiting unavailable - denying voice request');
    return { allowed: false, remaining: 0, error: 'Service temporarily unavailable' };
  }

  const key = `voice:rate:${clientIP}`;

  try {
    // Use pipeline for atomic incr+expire to prevent key persisting without TTL
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, RATE_LIMIT_WINDOW);
    const results = await multi.exec();
    const current = (results?.[0]?.[1] as number) ?? 1;

    const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - current);
    return {
      allowed: current <= RATE_LIMIT_MAX_REQUESTS,
      remaining
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    apiLogger.error('Rate limit check failed', { error: message });
    // SECURITY: Fail closed if rate limiting cannot be enforced
    return { allowed: false, remaining: 0, error: 'Rate limiting unavailable' };
  }
}
const MAX_TRANSCRIPT_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 10000;

// Provider configurations
const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY'
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-haiku-20240307',
    envKey: 'ANTHROPIC_API_KEY'
  }
};

// System prompt for voice command parsing
const SYSTEM_PROMPT = `You are a voice command processor for a ski race timing app.
Parse the user's spoken command and return a structured JSON response.

Context provided:
- role: "timer" (sets bib/point/run) or "gateJudge" (records faults)
- language: User's language (de/en)
- activeBibs: Racers currently on course (gate judge only)
- gateRange: Gates this judge is watching [start, end]
- pendingConfirmation: If set, user is responding to a confirmation prompt

For TIMER role, recognize:
- Bib numbers: spoken digits or number words (e.g., "forty-five" = 45, "fünfundvierzig" = 45)
- Timing point: "Start" / "Ziel" / "Finish"
- Run selection: "Lauf 1/2", "Run 1/2", "erster Lauf", "zweiter Lauf"
NOTE: Timer role does NOT support recording timestamps via voice (latency too high for timing)

For GATE JUDGE role, recognize:
- Fault recording with bib + gate + type
- Fault types: MG (missed gate/ausgelassen), STR (straddling/eingefädelt), BR (binding release/Bindung offen)
- Ready status: "Bereit", "Ready", "Fertig"
- Confirmation: "Ja", "Yes", "Correct", "Richtig", "Stimmt"
- Cancellation: "Nein", "No", "Cancel", "Abbrechen", "Falsch"

Return ONLY valid JSON (no markdown, no explanation):
{
  "action": "record_fault" | "set_bib" | "set_gate" | "set_point" | "set_run" | "toggle_ready" | "confirm" | "cancel" | "unknown",
  "confidence": 0.0-1.0,
  "params": {
    "bib": "string (3 digits, zero-padded)",
    "gate": number,
    "faultType": "MG" | "STR" | "BR",
    "point": "S" | "F",
    "run": 1 | 2
  },
  "confirmationNeeded": boolean,
  "confirmationPrompt": "string (spoken confirmation request in user's language)"
}

IMPORTANT:
- For gate judge faults, set confirmationNeeded=true with a clear prompt
- Confirmation prompts should be in the user's language
- If user tries to record time via voice, return action="unknown" (voice timing disabled)
- If unsure, set action="unknown" with low confidence`;

/**
 * Validate the request body
 */
function validateRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const b = body as Record<string, unknown>;
  const { transcript, context } = b;

  if (!transcript || typeof transcript !== 'string') {
    return { valid: false, error: 'Missing or invalid transcript' };
  }

  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return { valid: false, error: 'Transcript too long' };
  }

  if (!context || typeof context !== 'object') {
    return { valid: false, error: 'Missing or invalid context' };
  }

  const ctx = context as Record<string, unknown>;

  if (!['timer', 'gateJudge'].includes(ctx.role as string)) {
    return { valid: false, error: 'Invalid role in context' };
  }

  if (!['de', 'en'].includes(ctx.language as string)) {
    return { valid: false, error: 'Invalid language in context' };
  }

  return { valid: true };
}

/**
 * Build user message from transcript and context
 */
function buildUserMessage(transcript: string, context: VoiceContext): string {
  const contextJson = JSON.stringify({
    role: context.role,
    language: context.language,
    currentRun: context.currentRun || 1,
    activeBibs: context.activeBibs,
    gateRange: context.gateRange,
    pendingConfirmation: context.pendingConfirmation ? {
      action: context.pendingConfirmation.action,
      params: context.pendingConfirmation.params
    } : null
  });

  return `Context: ${contextJson}\n\nTranscript: "${sanitizeString(transcript, MAX_TRANSCRIPT_LENGTH)}"`;
}

/**
 * Parse LLM response content to extract intent
 */
function parseIntentFromContent(content: string | null | undefined): VoiceIntent {
  if (!content) {
    throw new Error('Empty response from LLM');
  }

  // Handle potential markdown code blocks
  let jsonContent = content.trim();
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
  }

  const intent: VoiceIntent = JSON.parse(jsonContent);

  // Validate required fields
  if (!intent.action || typeof intent.confidence !== 'number') {
    throw new Error('Invalid intent structure');
  }

  return intent;
}

/**
 * Fetch with timeout and abort handling
 * Shared by both LLM provider implementations
 */
async function fetchWithTimeout(url: string, options: RequestInit, providerName: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      apiLogger.error(`${providerName} API error`, { status: response.status, body: errorText });
      throw new Error(`${providerName} API error: ${response.status}`);
    }

    return await response.json();
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(transcript: string, context: VoiceContext, apiKey: string): Promise<VoiceIntent> {
  const userMessage = buildUserMessage(transcript, context);

  const result = await fetchWithTimeout(PROVIDERS.openai.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: PROVIDERS.openai.model,
      max_tokens: MAX_TOKENS,
      temperature: 0.1, // Low temperature for consistent parsing
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ]
    })
  }, 'OpenAI') as OpenAIResponse;

  const content = result.choices?.[0]?.message?.content || '';
  return parseIntentFromContent(content);
}

/**
 * Call Anthropic API
 */
async function callAnthropic(transcript: string, context: VoiceContext, apiKey: string): Promise<VoiceIntent> {
  const userMessage = buildUserMessage(transcript, context);

  const result = await fetchWithTimeout(PROVIDERS.anthropic.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: PROVIDERS.anthropic.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  }, 'Anthropic') as AnthropicResponse;

  // Extract content from Anthropic response format
  let content = '';
  if (result.content && Array.isArray(result.content)) {
    content = result.content[0]?.text || '';
  } else if (typeof result.content === 'string') {
    content = result.content;
  }

  return parseIntentFromContent(content);
}

/**
 * Main handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res);
  }

  // Rate limiting (voice API is expensive - protect against economic DoS)
  const clientIP = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
                   (req.headers['x-real-ip'] as string | undefined) ||
                   req.socket?.remoteAddress ||
                   'unknown';

  const rateLimit = await checkRateLimit(clientIP);
  if (!rateLimit.allowed) {
    apiLogger.warn('Voice API rate limit exceeded', { ip: clientIP });
    if (rateLimit.error) {
      return sendServiceUnavailable(res, 'Rate limiting unavailable');
    }
    return sendRateLimitExceeded(res, RATE_LIMIT_WINDOW);
  }

  // Set rate limit headers
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);

  // SECURITY: Validate authentication - voice API proxies to expensive LLM APIs
  // Fail closed: if Redis is unavailable, deny access rather than skip auth
  let redisClient: ReturnType<typeof getRedis>;
  try {
    redisClient = getRedis();
  } catch {
    return sendServiceUnavailable(res, 'Authentication service unavailable');
  }
  if (hasRedisError()) {
    return sendServiceUnavailable(res, 'Authentication service unavailable');
  }
  const authResult = await validateAuth(req, redisClient, CLIENT_PIN_KEY);
  if (!authResult.valid) {
    return sendAuthRequired(res, authResult.error, authResult.expired || false);
  }

  // Determine provider (default to OpenAI)
  const provider = (process.env.VOICE_LLM_PROVIDER || 'openai').toLowerCase();

  if (!PROVIDERS[provider]) {
    apiLogger.error('Invalid VOICE_LLM_PROVIDER', { provider });
    return sendServiceUnavailable(res, 'Invalid voice provider configuration');
  }

  // Get API key for selected provider
  const apiKey = process.env[PROVIDERS[provider].envKey];
  if (!apiKey) {
    // Log internally but don't expose which API key is missing
    apiLogger.error('Voice API key not configured', { provider });
    return sendServiceUnavailable(res, 'Voice service temporarily unavailable');
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e: unknown) {
    return sendBadRequest(res, 'Invalid JSON body');
  }

  const validation = validateRequest(body);
  if (!validation.valid) {
    return sendBadRequest(res, validation.error!);
  }

  const { transcript, context } = body as VoiceRequestBody;

  try {
    // Call appropriate provider
    const intent: VoiceIntent = provider === 'openai'
      ? await callOpenAI(transcript!, context!, apiKey)
      : await callAnthropic(transcript!, context!, apiKey);

    return sendSuccess(res, {
      success: true,
      intent,
      provider // Include provider in response for debugging
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    apiLogger.error('Voice processing error', { error: message, provider });

    // Return unknown intent on error (graceful degradation)
    // Do not leak internal error details or provider to client
    return sendSuccess(res, {
      success: true,
      intent: {
        action: 'unknown',
        confidence: 0,
        confirmationNeeded: false,
        error: 'Voice processing failed'
      }
    });
  }
}
