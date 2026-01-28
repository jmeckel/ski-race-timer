/**
 * LLM Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processVoiceCommandWithTimeout } from '../../../src/services/llmProvider';
import type { VoiceContext } from '../../../src/types';

describe('LLM Provider', () => {
  const mockContext: VoiceContext = {
    role: 'timer',
    language: 'de',
    currentRun: 1
  };

  const mockConfig = {
    endpoint: 'https://api.example.com/v1/messages',
    apiKey: 'test-api-key'
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('processVoiceCommandWithTimeout', () => {
    it('should return unknown intent on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await processVoiceCommandWithTimeout(
        'Zeit',
        mockContext,
        mockConfig,
        1000
      );

      expect(result.action).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should return unknown intent on timeout', async () => {
      const mockFetch = vi.fn().mockImplementation(() =>
        new Promise((resolve) => setTimeout(resolve, 5000))
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await processVoiceCommandWithTimeout(
        'Zeit',
        mockContext,
        mockConfig,
        100 // Very short timeout
      );

      expect(result.action).toBe('unknown');
    });

    it('should call fetch with correct parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{
            text: JSON.stringify({
              action: 'record_time',
              confidence: 0.95,
              confirmationNeeded: false
            })
          }]
        })
      });
      vi.stubGlobal('fetch', mockFetch);

      await processVoiceCommandWithTimeout(
        'Zeit',
        mockContext,
        mockConfig,
        5000
      );

      expect(mockFetch).toHaveBeenCalledWith(
        mockConfig.endpoint,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockConfig.apiKey}`
          })
        })
      );
    });

    it('should parse valid LLM response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{
            text: JSON.stringify({
              action: 'record_time',
              confidence: 0.95,
              confirmationNeeded: false
            })
          }]
        })
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await processVoiceCommandWithTimeout(
        'Zeit',
        mockContext,
        mockConfig,
        5000
      );

      expect(result.action).toBe('record_time');
      expect(result.confidence).toBe(0.95);
      expect(result.confirmationNeeded).toBe(false);
    });

    it('should handle gate judge context', async () => {
      const gateJudgeContext: VoiceContext = {
        role: 'gateJudge',
        language: 'en',
        currentRun: 2,
        activeBibs: ['001', '002', '003'],
        gateRange: [5, 10]
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{
            text: JSON.stringify({
              action: 'record_fault',
              confidence: 0.9,
              params: { bib: '045', gate: 7, faultType: 'MG' },
              confirmationNeeded: true,
              confirmationPrompt: 'Bib 45, Gate 7, Missed Gate?'
            })
          }]
        })
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await processVoiceCommandWithTimeout(
        'Bib 45 missed gate 7',
        gateJudgeContext,
        mockConfig,
        5000
      );

      expect(result.action).toBe('record_fault');
      expect(result.params?.bib).toBe('045');
      expect(result.params?.gate).toBe(7);
      expect(result.params?.faultType).toBe('MG');
      expect(result.confirmationNeeded).toBe(true);
    });
  });
});
