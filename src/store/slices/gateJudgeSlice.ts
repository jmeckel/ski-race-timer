/**
 * Gate Judge Slice
 * Handles gate judge state, assignments, and ready status
 */

import type { DeviceRole, GateColor, Run, Entry } from '../../types';

// Gate Judge State type
export interface GateJudgeState {
  deviceRole: DeviceRole;
  gateAssignment: [number, number] | null;
  firstGateColor: GateColor;
  selectedFaultBib: string;
  isJudgeReady: boolean;
  isChiefJudgeView: boolean;
  finalizedRacers: Set<string>;
  penaltySeconds: number;
  usePenaltyMode: boolean;
}

/**
 * Set device role
 */
export function setDeviceRole(role: DeviceRole): Partial<GateJudgeState> {
  return { deviceRole: role };
}

/**
 * Set gate assignment
 */
export function setGateAssignment(assignment: [number, number] | null): Partial<GateJudgeState> {
  return { gateAssignment: assignment };
}

/**
 * Set first gate color
 */
export function setFirstGateColor(color: GateColor): Partial<GateJudgeState> {
  return { firstGateColor: color };
}

/**
 * Get the color of a specific gate number based on firstGateColor
 * Gates alternate: if gate 4 is red, gate 5 is blue, gate 6 is red, etc.
 */
export function getGateColor(
  gateNumber: number,
  gateAssignment: [number, number] | null,
  firstGateColor: GateColor
): GateColor {
  if (!gateAssignment) return firstGateColor;

  const [startGate] = gateAssignment;
  const offset = gateNumber - startGate;
  // Alternating: even offset = firstGateColor, odd offset = opposite
  if (offset % 2 === 0) {
    return firstGateColor;
  }
  return firstGateColor === 'red' ? 'blue' : 'red';
}

/**
 * Set selected fault bib
 */
export function setSelectedFaultBib(bib: string): Partial<GateJudgeState> {
  return { selectedFaultBib: bib };
}

/**
 * Set judge ready status
 */
export function setJudgeReady(ready: boolean): Partial<GateJudgeState> {
  return { isJudgeReady: ready };
}

/**
 * Toggle judge ready status
 */
export function toggleJudgeReady(currentReady: boolean): Partial<GateJudgeState> {
  return { isJudgeReady: !currentReady };
}

/**
 * Set chief judge view state
 */
export function setChiefJudgeView(enabled: boolean): Partial<GateJudgeState> {
  return { isChiefJudgeView: enabled };
}

/**
 * Toggle chief judge view
 */
export function toggleChiefJudgeView(current: boolean): Partial<GateJudgeState> {
  return { isChiefJudgeView: !current };
}

/**
 * Finalize a racer
 */
export function finalizeRacer(
  bib: string,
  run: Run,
  currentFinalized: Set<string>
): Partial<GateJudgeState> {
  const key = `${bib}-${run}`;
  const finalizedRacers = new Set(currentFinalized);
  finalizedRacers.add(key);
  return { finalizedRacers };
}

/**
 * Unfinalize a racer
 */
export function unfinalizeRacer(
  bib: string,
  run: Run,
  currentFinalized: Set<string>
): Partial<GateJudgeState> {
  const key = `${bib}-${run}`;
  const finalizedRacers = new Set(currentFinalized);
  finalizedRacers.delete(key);
  return { finalizedRacers };
}

/**
 * Check if a racer is finalized
 */
export function isRacerFinalized(
  bib: string,
  run: Run,
  finalizedRacers: Set<string>
): boolean {
  const key = `${bib}-${run}`;
  return finalizedRacers.has(key);
}

/**
 * Clear all finalized racers
 */
export function clearFinalizedRacers(): Partial<GateJudgeState> {
  return { finalizedRacers: new Set() };
}

/**
 * Set penalty seconds per fault
 */
export function setPenaltySeconds(seconds: number): Partial<GateJudgeState> {
  return { penaltySeconds: Math.max(0, Math.min(60, seconds)) };
}

/**
 * Set penalty mode (penalty time vs DSQ)
 */
export function setUsePenaltyMode(usePenalty: boolean): Partial<GateJudgeState> {
  return { usePenaltyMode: usePenalty };
}

/**
 * Get active bibs (started but not finished) for current run
 */
export function getActiveBibs(entries: Entry[], run: Run): string[] {
  const started = entries.filter(e => e.point === 'S' && e.run === run);
  const finished = entries.filter(e => e.point === 'F' && e.run === run);
  const finishedBibs = new Set(finished.map(e => e.bib));
  // Use Set to deduplicate bibs
  const activeBibSet = new Set(
    started
      .filter(e => !finishedBibs.has(e.bib))
      .map(e => e.bib)
  );
  return Array.from(activeBibSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}
