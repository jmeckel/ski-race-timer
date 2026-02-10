/**
 * LLM Provider Service
 * Provider-agnostic interface for processing voice commands via LLM
 */

import type { LLMConfig, VoiceContext, VoiceIntent } from '../types';
import { logger } from '../utils/logger';

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
 * Default LLM configuration using Anthropic Claude
 */
const DEFAULT_CONFIG: Partial<LLMConfig> = {
  model: 'claude-3-haiku-20240307',
  maxTokens: 256,
};

/**
 * Check if using our proxy endpoint (returns pre-parsed intent)
 */
function isProxyEndpoint(endpoint: string): boolean {
  return endpoint.includes('/api/v1/voice');
}

/**
 * Process voice command using LLM (via proxy or direct API)
 */
export async function processVoiceCommand(
  transcript: string,
  context: VoiceContext,
  config: LLMConfig,
): Promise<VoiceIntent> {
  const { endpoint, apiKey, model, maxTokens } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  if (!endpoint) {
    throw new Error('LLM endpoint is required');
  }

  // Using our server-side proxy - simpler request format
  if (isProxyEndpoint(endpoint)) {
    return processViaProxy(transcript, context, endpoint);
  }

  // Direct API call (requires API key)
  if (!apiKey) {
    throw new Error('API key is required for direct LLM calls');
  }

  return processDirectAPI(
    transcript,
    context,
    endpoint,
    apiKey,
    model,
    maxTokens,
  );
}

/**
 * Process via our server-side proxy
 */
async function processViaProxy(
  transcript: string,
  context: VoiceContext,
  endpoint: string,
): Promise<VoiceIntent> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcript, context }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('[LLMProvider] Proxy error:', response.status, error);
      throw new Error(`Proxy error: ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.intent) {
      logger.debug('[LLMProvider] Proxy intent:', result.intent);
      return result.intent;
    }

    throw new Error('Invalid proxy response');
  } catch (error) {
    logger.error('[LLMProvider] Proxy processing error:', error);
    return {
      action: 'unknown',
      confidence: 0,
      confirmationNeeded: false,
    };
  }
}

/**
 * Process via direct Anthropic API call
 */
async function processDirectAPI(
  transcript: string,
  context: VoiceContext,
  endpoint: string,
  apiKey: string,
  model?: string,
  maxTokens?: number,
): Promise<VoiceIntent> {
  const contextJson = JSON.stringify({
    role: context.role,
    language: context.language,
    currentRun: context.currentRun,
    activeBibs: context.activeBibs,
    gateRange: context.gateRange,
    pendingConfirmation: context.pendingConfirmation
      ? {
          action: context.pendingConfirmation.action,
          params: context.pendingConfirmation.params,
        }
      : null,
  });

  const userMessage = `Context: ${contextJson}\n\nTranscript: "${transcript}"`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('[LLMProvider] API error:', response.status, error);
      throw new Error(`LLM API error: ${response.status}`);
    }

    const result = await response.json();

    // Extract text content from response
    let content = '';
    if (result.content && Array.isArray(result.content)) {
      content = result.content[0]?.text || '';
    } else if (typeof result.content === 'string') {
      content = result.content;
    }

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    // Parse JSON response - handle potential markdown code blocks
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent
        .replace(/```json?\n?/g, '')
        .replace(/```$/g, '')
        .trim();
    }

    const intent = JSON.parse(jsonContent) as VoiceIntent;

    // Validate required fields
    if (!intent.action || typeof intent.confidence !== 'number') {
      throw new Error('Invalid intent structure');
    }

    logger.debug('[LLMProvider] Parsed intent:', intent);
    return intent;
  } catch (error) {
    logger.error('[LLMProvider] Processing error:', error);

    // Return unknown intent on error
    return {
      action: 'unknown',
      confidence: 0,
      confirmationNeeded: false,
    };
  }
}

/**
 * Create a timeout-wrapped version of processVoiceCommand
 */
export async function processVoiceCommandWithTimeout(
  transcript: string,
  context: VoiceContext,
  config: LLMConfig,
  timeoutMs: number = 5000,
): Promise<VoiceIntent> {
  const timeoutPromise = new Promise<VoiceIntent>((_, reject) => {
    setTimeout(() => reject(new Error('LLM request timeout')), timeoutMs);
  });

  return Promise.race([
    processVoiceCommand(transcript, context, config),
    timeoutPromise,
  ]).catch((error) => {
    logger.warn('[LLMProvider] Timeout or error:', error);
    return {
      action: 'unknown' as const,
      confidence: 0,
      confirmationNeeded: false,
    };
  });
}
