/**
 * Voice Mode Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { voiceModeService } from '../../../src/services/voice';
import { speechSynthesis } from '../../../src/services/speechSynthesis';

describe('Voice Mode Service', () => {
  describe('isSupported', () => {
    it('should check for SpeechRecognition support', () => {
      // In jsdom, SpeechRecognition is not available
      const supported = voiceModeService.isSupported();
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('getStatus', () => {
    it('should return inactive by default', () => {
      expect(voiceModeService.getStatus()).toBe('inactive');
    });
  });

  describe('isActive', () => {
    it('should return false by default', () => {
      expect(voiceModeService.isActive()).toBe(false);
    });
  });

  describe('onStatusChange', () => {
    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = voiceModeService.onStatusChange(callback);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('onAction', () => {
    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = voiceModeService.onAction(callback);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});

describe('Speech Synthesis Service', () => {
  describe('isSupported', () => {
    it('should check for SpeechSynthesis support', () => {
      const supported = speechSynthesis.isSupported();
      // In jsdom with mocked speechSynthesis, this should be true
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('setLanguage', () => {
    it('should not throw when setting language', () => {
      expect(() => speechSynthesis.setLanguage('de')).not.toThrow();
      expect(() => speechSynthesis.setLanguage('en')).not.toThrow();
    });
  });

  describe('cancel', () => {
    it('should not throw when cancelling', () => {
      expect(() => speechSynthesis.cancel()).not.toThrow();
    });
  });
});
