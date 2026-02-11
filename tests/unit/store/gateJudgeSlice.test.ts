/**
 * Unit Tests for Gate Judge Slice
 * Tests: device role, gate assignment, gate colors, fault bib,
 *        judge ready, chief judge view, finalized racers,
 *        penalty settings, active bibs
 */

import { describe, expect, it } from 'vitest';
import {
  clearFinalizedRacers,
  finalizeRacer,
  getActiveBibs,
  getGateColor,
  isRacerFinalized,
  setChiefJudgeView,
  setDeviceRole,
  setFirstGateColor,
  setGateAssignment,
  setJudgeReady,
  setPenaltySeconds,
  setSelectedFaultBib,
  setUsePenaltyMode,
  toggleChiefJudgeView,
  toggleJudgeReady,
  unfinalizeRacer,
} from '../../../src/store/slices/gateJudgeSlice';
import type { Entry } from '../../../src/types';

// Helper to create entries for getActiveBibs testing
function createEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: `dev_test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    bib: '042',
    point: 'S',
    run: 1,
    timestamp: new Date().toISOString(),
    status: 'ok',
    deviceId: 'dev_test',
    deviceName: 'Timer 1',
    ...overrides,
  };
}

describe('Gate Judge Slice', () => {
  describe('setDeviceRole', () => {
    it('should return timer role state', () => {
      const result = setDeviceRole('timer');
      expect(result.deviceRole).toBe('timer');
    });

    it('should return gateJudge role state', () => {
      const result = setDeviceRole('gateJudge');
      expect(result.deviceRole).toBe('gateJudge');
    });
  });

  describe('setGateAssignment', () => {
    it('should return gate assignment state', () => {
      const result = setGateAssignment([4, 12]);
      expect(result.gateAssignment).toEqual([4, 12]);
    });

    it('should return null assignment', () => {
      const result = setGateAssignment(null);
      expect(result.gateAssignment).toBeNull();
    });
  });

  describe('setFirstGateColor', () => {
    it('should set red as first gate color', () => {
      const result = setFirstGateColor('red');
      expect(result.firstGateColor).toBe('red');
    });

    it('should set blue as first gate color', () => {
      const result = setFirstGateColor('blue');
      expect(result.firstGateColor).toBe('blue');
    });
  });

  describe('getGateColor', () => {
    it('should return firstGateColor when no gate assignment', () => {
      expect(getGateColor(5, null, 'red')).toBe('red');
      expect(getGateColor(5, null, 'blue')).toBe('blue');
    });

    it('should return firstGateColor for the start gate (offset 0)', () => {
      expect(getGateColor(4, [4, 12], 'red')).toBe('red');
      expect(getGateColor(4, [4, 12], 'blue')).toBe('blue');
    });

    it('should alternate colors for subsequent gates', () => {
      // Assignment starts at gate 4, firstGateColor is red
      expect(getGateColor(4, [4, 12], 'red')).toBe('red'); // offset 0
      expect(getGateColor(5, [4, 12], 'red')).toBe('blue'); // offset 1
      expect(getGateColor(6, [4, 12], 'red')).toBe('red'); // offset 2
      expect(getGateColor(7, [4, 12], 'red')).toBe('blue'); // offset 3
    });

    it('should alternate with blue as first color', () => {
      expect(getGateColor(4, [4, 12], 'blue')).toBe('blue'); // offset 0
      expect(getGateColor(5, [4, 12], 'blue')).toBe('red'); // offset 1
      expect(getGateColor(6, [4, 12], 'blue')).toBe('blue'); // offset 2
      expect(getGateColor(7, [4, 12], 'blue')).toBe('red'); // offset 3
    });

    it('should handle gate at end of range', () => {
      expect(getGateColor(12, [4, 12], 'red')).toBe('red'); // offset 8 (even)
      expect(getGateColor(11, [4, 12], 'red')).toBe('blue'); // offset 7 (odd)
    });

    it('should handle single gate range', () => {
      expect(getGateColor(5, [5, 5], 'red')).toBe('red'); // offset 0
    });
  });

  describe('setSelectedFaultBib', () => {
    it('should set the selected fault bib', () => {
      const result = setSelectedFaultBib('042');
      expect(result.selectedFaultBib).toBe('042');
    });

    it('should set empty bib', () => {
      const result = setSelectedFaultBib('');
      expect(result.selectedFaultBib).toBe('');
    });
  });

  describe('setJudgeReady', () => {
    it('should set judge ready to true', () => {
      const result = setJudgeReady(true);
      expect(result.isJudgeReady).toBe(true);
    });

    it('should set judge ready to false', () => {
      const result = setJudgeReady(false);
      expect(result.isJudgeReady).toBe(false);
    });
  });

  describe('toggleJudgeReady', () => {
    it('should toggle from false to true', () => {
      const result = toggleJudgeReady(false);
      expect(result.isJudgeReady).toBe(true);
    });

    it('should toggle from true to false', () => {
      const result = toggleJudgeReady(true);
      expect(result.isJudgeReady).toBe(false);
    });
  });

  describe('setChiefJudgeView', () => {
    it('should enable chief judge view', () => {
      const result = setChiefJudgeView(true);
      expect(result.isChiefJudgeView).toBe(true);
    });

    it('should disable chief judge view', () => {
      const result = setChiefJudgeView(false);
      expect(result.isChiefJudgeView).toBe(false);
    });
  });

  describe('toggleChiefJudgeView', () => {
    it('should toggle from false to true', () => {
      const result = toggleChiefJudgeView(false);
      expect(result.isChiefJudgeView).toBe(true);
    });

    it('should toggle from true to false', () => {
      const result = toggleChiefJudgeView(true);
      expect(result.isChiefJudgeView).toBe(false);
    });
  });

  describe('finalizeRacer', () => {
    it('should add racer to finalized set', () => {
      const current = new Set<string>();
      const result = finalizeRacer('042', 1, current);

      expect(result.finalizedRacers!.has('042-1')).toBe(true);
    });

    it('should preserve existing finalized racers', () => {
      const current = new Set(['001-1', '002-1']);
      const result = finalizeRacer('042', 1, current);

      expect(result.finalizedRacers!.has('001-1')).toBe(true);
      expect(result.finalizedRacers!.has('002-1')).toBe(true);
      expect(result.finalizedRacers!.has('042-1')).toBe(true);
      expect(result.finalizedRacers!.size).toBe(3);
    });

    it('should handle different runs', () => {
      const current = new Set(['042-1']);
      const result = finalizeRacer('042', 2, current);

      expect(result.finalizedRacers!.has('042-1')).toBe(true);
      expect(result.finalizedRacers!.has('042-2')).toBe(true);
    });

    it('should not mutate the original set', () => {
      const current = new Set<string>();
      finalizeRacer('042', 1, current);

      expect(current.size).toBe(0);
    });
  });

  describe('unfinalizeRacer', () => {
    it('should remove racer from finalized set', () => {
      const current = new Set(['042-1', '099-1']);
      const result = unfinalizeRacer('042', 1, current);

      expect(result.finalizedRacers!.has('042-1')).toBe(false);
      expect(result.finalizedRacers!.has('099-1')).toBe(true);
    });

    it('should handle removing non-existent racer', () => {
      const current = new Set(['042-1']);
      const result = unfinalizeRacer('099', 1, current);

      expect(result.finalizedRacers!.size).toBe(1);
      expect(result.finalizedRacers!.has('042-1')).toBe(true);
    });

    it('should not mutate the original set', () => {
      const current = new Set(['042-1']);
      unfinalizeRacer('042', 1, current);

      expect(current.has('042-1')).toBe(true);
    });
  });

  describe('isRacerFinalized', () => {
    it('should return true for finalized racer', () => {
      const finalized = new Set(['042-1', '099-2']);
      expect(isRacerFinalized('042', 1, finalized)).toBe(true);
      expect(isRacerFinalized('099', 2, finalized)).toBe(true);
    });

    it('should return false for non-finalized racer', () => {
      const finalized = new Set(['042-1']);
      expect(isRacerFinalized('099', 1, finalized)).toBe(false);
    });

    it('should distinguish between runs', () => {
      const finalized = new Set(['042-1']);
      expect(isRacerFinalized('042', 1, finalized)).toBe(true);
      expect(isRacerFinalized('042', 2, finalized)).toBe(false);
    });

    it('should handle empty set', () => {
      const finalized = new Set<string>();
      expect(isRacerFinalized('042', 1, finalized)).toBe(false);
    });
  });

  describe('clearFinalizedRacers', () => {
    it('should return empty set', () => {
      const result = clearFinalizedRacers();
      expect(result.finalizedRacers!.size).toBe(0);
    });
  });

  describe('setPenaltySeconds', () => {
    it('should set penalty seconds', () => {
      const result = setPenaltySeconds(5);
      expect(result.penaltySeconds).toBe(5);
    });

    it('should clamp to minimum of 0', () => {
      const result = setPenaltySeconds(-5);
      expect(result.penaltySeconds).toBe(0);
    });

    it('should clamp to maximum of 60', () => {
      const result = setPenaltySeconds(100);
      expect(result.penaltySeconds).toBe(60);
    });

    it('should allow 0 seconds', () => {
      const result = setPenaltySeconds(0);
      expect(result.penaltySeconds).toBe(0);
    });

    it('should allow 60 seconds', () => {
      const result = setPenaltySeconds(60);
      expect(result.penaltySeconds).toBe(60);
    });
  });

  describe('setUsePenaltyMode', () => {
    it('should enable penalty mode', () => {
      const result = setUsePenaltyMode(true);
      expect(result.usePenaltyMode).toBe(true);
    });

    it('should disable penalty mode', () => {
      const result = setUsePenaltyMode(false);
      expect(result.usePenaltyMode).toBe(false);
    });
  });

  describe('getActiveBibs', () => {
    it('should return bibs that started but not finished', () => {
      const entries: Entry[] = [
        createEntry({ bib: '042', point: 'S', run: 1 }),
        createEntry({ bib: '099', point: 'S', run: 1 }),
        createEntry({ bib: '042', point: 'F', run: 1 }),
      ];

      const result = getActiveBibs(entries, 1);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('099');
    });

    it('should return empty array when no started racers', () => {
      const entries: Entry[] = [];
      const result = getActiveBibs(entries, 1);

      expect(result).toHaveLength(0);
    });

    it('should return empty array when all racers finished', () => {
      const entries: Entry[] = [
        createEntry({ bib: '042', point: 'S', run: 1 }),
        createEntry({ bib: '042', point: 'F', run: 1 }),
      ];

      const result = getActiveBibs(entries, 1);
      expect(result).toHaveLength(0);
    });

    it('should filter by run number', () => {
      const entries: Entry[] = [
        createEntry({ bib: '042', point: 'S', run: 1 }),
        createEntry({ bib: '042', point: 'F', run: 1 }),
        createEntry({ bib: '042', point: 'S', run: 2 }),
        // bib 042 started run 2 but not finished
      ];

      const run1Active = getActiveBibs(entries, 1);
      const run2Active = getActiveBibs(entries, 2);

      expect(run1Active).toHaveLength(0);
      expect(run2Active).toHaveLength(1);
      expect(run2Active[0]).toBe('042');
    });

    it('should sort bibs numerically', () => {
      const entries: Entry[] = [
        createEntry({ bib: '099', point: 'S', run: 1 }),
        createEntry({ bib: '005', point: 'S', run: 1 }),
        createEntry({ bib: '042', point: 'S', run: 1 }),
      ];

      const result = getActiveBibs(entries, 1);

      expect(result).toEqual(['005', '042', '099']);
    });

    it('should deduplicate bibs (multiple start entries for same bib)', () => {
      const entries: Entry[] = [
        createEntry({ bib: '042', point: 'S', run: 1 }),
        createEntry({ bib: '042', point: 'S', run: 1 }), // duplicate start
      ];

      const result = getActiveBibs(entries, 1);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('042');
    });

    it('should handle multiple active racers across runs', () => {
      const entries: Entry[] = [
        createEntry({ bib: '001', point: 'S', run: 1 }),
        createEntry({ bib: '002', point: 'S', run: 1 }),
        createEntry({ bib: '003', point: 'S', run: 1 }),
        createEntry({ bib: '001', point: 'F', run: 1 }),
      ];

      const result = getActiveBibs(entries, 1);

      expect(result).toHaveLength(2);
      expect(result).toEqual(['002', '003']);
    });
  });
});
