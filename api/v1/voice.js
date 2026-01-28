/**
 * Voice Command Processing API
 * Proxies voice commands to Anthropic Claude API for natural language understanding
 *
 * POST /api/v1/voice
 * Body: { transcript: string, context: VoiceContext }
 * Returns: VoiceIntent
 */

import {
  handlePreflight,
  sendSuccess,
  sendError,
  sendBadRequest,
  sendMethodNotAllowed,
  sendServiceUnavailable,
  sanitizeString
} from '../lib/response.js';

// Configuration
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-haiku-20240307'; // Fast and cheap for command parsing
const MAX_TOKENS = 256;
const MAX_TRANSCRIPT_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 10000;

// System prompt for voice command parsing
const SYSTEM_PROMPT = `You are a voice command processor for a ski race timing app.
Parse the user's spoken command and return a structured JSON response.

Context provided:
- role: "timer" (records timestamps) or "gateJudge" (records faults)
- language: User's language (de/en)
- activeBibs: Racers currently on course (gate judge only)
- gateRange: Gates this judge is watching [start, end]
- pendingConfirmation: If set, user is responding to a confirmation prompt

For TIMER role, recognize:
- Recording time: "Zeit", "Jetzt", "Time", "Now", "Mark", "Go", "Los"
- Bib numbers: spoken digits or number words (e.g., "forty-five" = 45, "fünfundvierzig" = 45)
- Timing point: "Start" / "Ziel" / "Finish"
- Run selection: "Lauf 1/2", "Run 1/2", "erster Lauf", "zweiter Lauf"

For GATE JUDGE role, recognize:
- Fault recording with bib + gate + type
- Fault types: MG (missed gate/ausgelassen), STR (straddling/eingefädelt), BD (binding released)
- Ready status: "Bereit", "Ready", "Fertig"
- Confirmation: "Ja", "Yes", "Correct", "Richtig", "Stimmt"
- Cancellation: "Nein", "No", "Cancel", "Abbrechen", "Falsch"

Return ONLY valid JSON (no markdown, no explanation):
{
  "action": "record_time" | "record_fault" | "set_bib" | "set_gate" | "set_point" | "set_run" | "toggle_ready" | "confirm" | "cancel" | "unknown",
  "confidence": 0.0-1.0,
  "params": {
    "bib": "string (3 digits, zero-padded)",
    "gate": number,
    "faultType": "MG" | "STR" | "BD",
    "point": "S" | "F",
    "run": 1 | 2
  },
  "confirmationNeeded": boolean,
  "confirmationPrompt": "string (spoken confirmation request in user's language)"
}

IMPORTANT:
- For timer role "record_time", set confirmationNeeded=false (fast path)
- For gate judge faults, set confirmationNeeded=true with a clear prompt
- Confirmation prompts should be in the user's language
- If unsure, set action="unknown" with low confidence`;

/**
 * Validate the request body
 */
function validateRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const { transcript, context } = body;

  if (!transcript || typeof transcript !== 'string') {
    return { valid: false, error: 'Missing or invalid transcript' };
  }

  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return { valid: false, error: 'Transcript too long' };
  }

  if (!context || typeof context !== 'object') {
    return { valid: false, error: 'Missing or invalid context' };
  }

  if (!['timer', 'gateJudge'].includes(context.role)) {
    return { valid: false, error: 'Invalid role in context' };
  }

  if (!['de', 'en'].includes(context.language)) {
    return { valid: false, error: 'Invalid language in context' };
  }

  return { valid: true };
}

/**
 * Call Anthropic API with timeout
 */
async function callAnthropicAPI(transcript, context, apiKey) {
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

  const userMessage = `Context: ${contextJson}\n\nTranscript: "${sanitizeString(transcript, MAX_TRANSCRIPT_LENGTH)}"`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
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
      throw new Error('Empty response from Anthropic');
    }

    // Parse JSON response - handle potential markdown code blocks
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const intent = JSON.parse(jsonContent);

    // Validate required fields
    if (!intent.action || typeof intent.confidence !== 'number') {
      throw new Error('Invalid intent structure');
    }

    return intent;

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }

    throw error;
  }
}

/**
 * Main handler
 */
export default async function handler(req, res) {
  // Handle CORS preflight
  if (handlePreflight(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return sendMethodNotAllowed(res);
  }

  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    return sendServiceUnavailable(res, 'Voice service not configured');
  }

  // Parse and validate request body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return sendBadRequest(res, 'Invalid JSON body');
  }

  const validation = validateRequest(body);
  if (!validation.valid) {
    return sendBadRequest(res, validation.error);
  }

  const { transcript, context } = body;

  try {
    const intent = await callAnthropicAPI(transcript, context, apiKey);

    return sendSuccess(res, {
      success: true,
      intent
    });

  } catch (error) {
    console.error('Voice processing error:', error.message);

    // Return unknown intent on error (graceful degradation)
    return sendSuccess(res, {
      success: true,
      intent: {
        action: 'unknown',
        confidence: 0,
        confirmationNeeded: false,
        error: error.message
      }
    });
  }
}
