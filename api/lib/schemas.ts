/**
 * Valibot Schemas for API Runtime Validation
 * Provides type-safe runtime validation that generates TypeScript types.
 * These schemas gradually replace manual isValidEntry/isValidFaultEntry functions.
 */

import * as v from 'valibot';

// ─── Shared Schemas ───

export const RaceIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(50),
  v.regex(/^[a-zA-Z0-9_-]+$/),
);

export const PinSchema = v.pipe(v.string(), v.regex(/^\d{4}$/));

export const DeviceIdSchema = v.pipe(v.string(), v.maxLength(50));

export const DeviceNameSchema = v.pipe(v.string(), v.maxLength(100));

export const BibSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(10));

export const RunSchema = v.union([v.literal(1), v.literal(2)]);

export const TimingPointSchema = v.union([v.literal('S'), v.literal('F')]);

export const EntryStatusSchema = v.union([
  v.literal('ok'),
  v.literal('dns'),
  v.literal('dnf'),
  v.literal('dsq'),
  v.literal('flt'),
]);

export const FaultTypeSchema = v.union([
  v.literal('MG'),
  v.literal('STR'),
  v.literal('BR'),
]);

export const RoleSchema = v.union([
  v.literal('timer'),
  v.literal('gateJudge'),
  v.literal('chiefJudge'),
]);

// ─── Entry Schemas ───

export const TimestampSchema = v.pipe(
  v.string(),
  v.check((val) => !Number.isNaN(Date.parse(val)), 'Invalid timestamp format'),
);

export const EntrySchema = v.object({
  id: v.union([
    v.pipe(v.number(), v.minValue(1)),
    v.pipe(v.string(), v.minLength(1)),
  ]),
  bib: v.optional(BibSchema),
  point: TimingPointSchema,
  timestamp: TimestampSchema,
  status: v.optional(EntryStatusSchema),
  run: v.optional(RunSchema),
  photo: v.optional(v.string()),
  gpsCoords: v.optional(
    v.object({
      latitude: v.number(),
      longitude: v.number(),
      accuracy: v.number(),
    }),
  ),
});

export const SyncPostBodySchema = v.object({
  entry: EntrySchema,
  deviceId: v.optional(v.string()),
  deviceName: v.optional(v.string()),
});

export const SyncDeleteBodySchema = v.object({
  entryId: v.union([v.string(), v.number()]),
  deviceId: v.optional(v.string()),
  deviceName: v.optional(v.string()),
});

// ─── Fault Schemas ───

export const GateRangeSchema = v.pipe(v.array(v.number()), v.length(2));

export const FaultEntrySchema = v.object({
  id: v.union([v.number(), v.pipe(v.string(), v.minLength(1))]),
  bib: BibSchema,
  run: RunSchema,
  gateNumber: v.pipe(v.number(), v.minValue(1)),
  faultType: FaultTypeSchema,
  timestamp: TimestampSchema,
  gateRange: GateRangeSchema,
  notes: v.optional(v.nullable(v.string())),
  notesSource: v.optional(
    v.nullable(v.union([v.literal('voice'), v.literal('manual')])),
  ),
  notesTimestamp: v.optional(v.nullable(v.string())),
  currentVersion: v.optional(v.number()),
  versionHistory: v.optional(v.array(v.unknown())),
  markedForDeletion: v.optional(v.boolean()),
  markedForDeletionAt: v.optional(v.nullable(v.string())),
  markedForDeletionBy: v.optional(v.nullable(v.string())),
  markedForDeletionByDeviceId: v.optional(v.nullable(v.string())),
  deletionApprovedAt: v.optional(v.nullable(v.string())),
  deletionApprovedBy: v.optional(v.nullable(v.string())),
});

export const FaultPostBodySchema = v.object({
  fault: FaultEntrySchema,
  deviceId: v.optional(v.string()),
  deviceName: v.optional(v.string()),
  gateRange: v.optional(GateRangeSchema),
  isReady: v.optional(v.boolean()),
  firstGateColor: v.optional(v.union([v.literal('red'), v.literal('blue')])),
});

export const FaultDeleteBodySchema = v.object({
  faultId: v.union([v.string(), v.number()]),
  deviceId: v.optional(v.string()),
  deviceName: v.optional(v.string()),
  approvedBy: v.optional(v.string()),
});

// ─── Auth Schemas ───

export const TokenRequestSchema = v.object({
  pin: PinSchema,
  role: v.optional(RoleSchema),
});

export const ChangePinBodySchema = v.object({
  currentPin: PinSchema,
  newPin: PinSchema,
});

export const ResetPinBodySchema = v.object({
  serverPin: v.pipe(v.string(), v.minLength(1)),
});

// ─── Inferred Types ───

export type RaceId = v.InferOutput<typeof RaceIdSchema>;
export type Entry = v.InferOutput<typeof EntrySchema>;
export type FaultEntry = v.InferOutput<typeof FaultEntrySchema>;
export type TokenRequest = v.InferOutput<typeof TokenRequestSchema>;
export type Role = v.InferOutput<typeof RoleSchema>;
export type FaultType = v.InferOutput<typeof FaultTypeSchema>;

/**
 * Validate data against a schema, returning { success, data, error }
 */
export function validate<T>(
  schema: v.GenericSchema<unknown, T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = v.safeParse(schema, data);
  if (result.success) {
    return { success: true, data: result.output };
  }
  const firstIssue = result.issues[0];
  const path = firstIssue?.path
    ?.map((p) => ('key' in p ? p.key : ''))
    .join('.');
  const message = path
    ? `${path}: ${firstIssue?.message}`
    : firstIssue?.message || 'Validation failed';
  return { success: false, error: message };
}
