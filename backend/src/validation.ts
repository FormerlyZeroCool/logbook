import { z } from 'zod';

const keyPattern = /^[a-z][a-z0-9_-]*$/;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isValidTimeZone, 'Use a valid IANA time zone such as America/New_York');

export const eventTypeKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(keyPattern, 'Use a lowercase slug such as dog_walk or water');

export const unitTypeKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(keyPattern, 'Use a lowercase unit type key such as mass, energy, or power');

export const unitKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(keyPattern, 'Use an exact unit key such as g, kg, wh, kwh, w, or kw');

export const eventTypeIdSchema = z.string().uuid();
export const eventIdSchema = z.string().uuid();
export const eventKindSchema = z.enum(['point', 'duration']);

const nullableDescription = z.string().trim().max(1_000).nullable().optional();
const aliasesSchema = z.array(z.string().trim().min(1).max(100)).max(50).default([]);
export const voiceAliasesSchema = z.array(z.string().trim().min(1).max(120)).max(50)
  .transform((values: string[]) => [...new Set(values)]);
const positiveFiniteNumber = z.number().finite().positive();
const finiteNumber = z.number().finite();

export const baseUnitCreateSchema = z.object({
  key: unitKeySchema,
  name: z.string().trim().min(1).max(120),
  symbol: z.string().trim().min(1).max(30),
  aliases: aliasesSchema.optional()
});

export const unitTypeCreateSchema = z.object({
  key: unitTypeKeySchema,
  name: z.string().trim().min(1).max(120),
  description: nullableDescription,
  baseUnit: baseUnitCreateSchema
});

const unitTypeUpdateObjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: nullableDescription
});
type UnitTypeUpdateCandidate = z.infer<typeof unitTypeUpdateObjectSchema>;

export const unitTypeUpdateSchema = unitTypeUpdateObjectSchema.refine(
  (value: UnitTypeUpdateCandidate) => Object.keys(value).length > 0,
  'At least one field is required'
);

export const unitCreateSchema = z.object({
  key: unitKeySchema,
  name: z.string().trim().min(1).max(120),
  symbol: z.string().trim().min(1).max(30),
  scaleToBase: positiveFiniteNumber,
  offsetToBase: finiteNumber.default(0),
  aliases: aliasesSchema.optional()
});

const unitUpdateObjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  symbol: z.string().trim().min(1).max(30).optional(),
  scaleToBase: positiveFiniteNumber.optional(),
  offsetToBase: finiteNumber.optional(),
  aliases: aliasesSchema.optional()
});
type UnitUpdateCandidate = z.infer<typeof unitUpdateObjectSchema>;

export const unitUpdateSchema = unitUpdateObjectSchema.refine(
  (value: UnitUpdateCandidate) => Object.keys(value).length > 0,
  'At least one field is required'
);

const eventTypeFields = {
  key: eventTypeKeySchema,
  name: z.string().trim().min(1).max(120),
  description: nullableDescription,
  unitTypeKey: unitTypeKeySchema.nullable().optional(),
  defaultUnitKey: unitKeySchema.nullable().optional(),
  icon: z.string().trim().max(100).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  voiceAliases: voiceAliasesSchema.optional()
};

const eventTypeCreateObjectSchema = z.object(eventTypeFields);
type EventTypeCreateCandidate = z.infer<typeof eventTypeCreateObjectSchema>;

export const eventTypeCreateSchema = eventTypeCreateObjectSchema.refine(
  (value: EventTypeCreateCandidate) => value.unitTypeKey != null || value.defaultUnitKey == null,
  { message: 'defaultUnitKey requires unitTypeKey' }
);

const eventTypeUpdateObjectSchema = z.object({
  name: eventTypeFields.name.optional(),
  description: eventTypeFields.description,
  unitTypeKey: eventTypeFields.unitTypeKey,
  defaultUnitKey: eventTypeFields.defaultUnitKey,
  icon: eventTypeFields.icon,
  color: eventTypeFields.color,
  voiceAliases: eventTypeFields.voiceAliases,
  isActive: z.boolean().optional()
});
type EventTypeUpdateCandidate = z.infer<typeof eventTypeUpdateObjectSchema>;

export const eventTypeUpdateSchema = eventTypeUpdateObjectSchema
  .refine(
    (value: EventTypeUpdateCandidate) => Object.keys(value).length > 0,
    'At least one field is required'
  )
  .refine(
    (value: EventTypeUpdateCandidate) => value.unitTypeKey !== null || value.defaultUnitKey == null,
    { message: 'defaultUnitKey must be null when unitTypeKey is null' }
  );

const dateTimeSchema = z.string().datetime({ offset: true });
const metadataSchema = z.record(z.string(), z.unknown());
const eventTypeReference = {
  eventTypeId: eventTypeIdSchema.optional(),
  eventTypeKey: eventTypeKeySchema.optional()
};
const eventValueFields = {
  value: z.number().finite().nullable().optional(),
  unitKey: unitKeySchema.nullable().optional(),
  textValue: z.string().max(4_000).nullable().optional(),
  note: z.string().max(4_000).nullable().optional(),
  metadata: metadataSchema.optional()
};

type EventTypeReferenceCandidate = {
  eventTypeId?: string | undefined;
  eventTypeKey?: string | undefined;
};

type EventValueCandidate = {
  value?: number | null | undefined;
  unitKey?: string | null | undefined;
};

function hasExactlyOneTypeReference(value: EventTypeReferenceCandidate): boolean {
  return Number(value.eventTypeId !== undefined) + Number(value.eventTypeKey !== undefined) === 1;
}

function hasAtMostOneTypeReference(value: EventTypeReferenceCandidate): boolean {
  return Number(value.eventTypeId !== undefined) + Number(value.eventTypeKey !== undefined) <= 1;
}

function unitRequiresValue(value: EventValueCandidate): boolean {
  return value.unitKey == null || (value.value !== undefined && value.value !== null);
}

export const pointEventLogSchema = z.object({
  ...eventTypeReference,
  occurredAt: dateTimeSchema.optional(),
  ...eventValueFields
})
  .refine(hasExactlyOneTypeReference, { message: 'Provide exactly one of eventTypeId or eventTypeKey' })
  .refine(unitRequiresValue, { message: 'unitKey requires a numeric value' });

export const durationEventStartSchema = z.object({
  ...eventTypeReference,
  startedAt: dateTimeSchema.optional(),
  ...eventValueFields
})
  .refine(hasExactlyOneTypeReference, { message: 'Provide exactly one of eventTypeId or eventTypeKey' })
  .refine(unitRequiresValue, { message: 'unitKey requires a numeric value' });

const positiveIntegerQuerySchema = z.coerce.number().int().positive();
const ongoingQuerySchema = z.enum(['true', 'false']).transform((value: 'true' | 'false') => value === 'true');

const eventListQueryObjectSchema = z.object({
  eventTypeId: eventTypeIdSchema.optional(),
  eventTypeKey: eventTypeKeySchema.optional(),
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  before: dateTimeSchema.optional(),
  ongoing: ongoingQuerySchema.optional(),
  note: z.string().trim().min(1).max(500).optional(),
  page: positiveIntegerQuerySchema.default(1),
  pageSize: positiveIntegerQuerySchema.max(100).optional(),
  limit: positiveIntegerQuerySchema.max(500).optional()
});
type EventListQueryCandidate = z.infer<typeof eventListQueryObjectSchema>;

export const eventListQuerySchema = eventListQueryObjectSchema
  .refine(hasAtMostOneTypeReference, { message: 'Provide at most one of eventTypeId or eventTypeKey' })
  .refine(
    (value: EventListQueryCandidate) => !(value.pageSize !== undefined && value.limit !== undefined),
    { message: 'Use only one of pageSize or limit' }
  );

const eventUpdateObjectSchema = z.object({
  ...eventTypeReference,
  startedAt: dateTimeSchema.optional(),
  endedAt: dateTimeSchema.nullable().optional(),
  ...eventValueFields
});
type EventUpdateCandidate = z.infer<typeof eventUpdateObjectSchema>;

export const eventUpdateSchema = eventUpdateObjectSchema
  .refine(hasAtMostOneTypeReference, { message: 'Provide at most one of eventTypeId or eventTypeKey' })
  .refine(
    (value: EventUpdateCandidate) => Object.keys(value).length > 0,
    'At least one field is required'
  )
  .refine(unitRequiresValue, { message: 'unitKey requires a numeric value' });

const latestEventUpdateObjectSchema = z.object({
  startedAt: dateTimeSchema.optional(),
  ...eventValueFields
});
type LatestEventUpdateCandidate = z.infer<typeof latestEventUpdateObjectSchema>;

export const latestEventUpdateSchema = latestEventUpdateObjectSchema
  .refine(
    (value: LatestEventUpdateCandidate) => Object.keys(value).length > 0,
    'At least one field is required'
  )
  .refine(unitRequiresValue, { message: 'unitKey requires a numeric value' });

const eventEndObjectSchema = z.object({
  eventId: eventIdSchema.optional(),
  ...eventTypeReference,
  endedAt: dateTimeSchema.optional(),
  value: eventValueFields.value,
  unitKey: eventValueFields.unitKey
});
type EventEndCandidate = z.infer<typeof eventEndObjectSchema>;

export const eventEndSchema = eventEndObjectSchema
  .refine(
    (value: EventEndCandidate) => (
      Number(value.eventId !== undefined)
      + Number(value.eventTypeId !== undefined)
      + Number(value.eventTypeKey !== undefined)
    ) === 1,
    { message: 'Provide exactly one of eventId, eventTypeId, or eventTypeKey' }
  )
  .refine(unitRequiresValue, { message: 'unitKey requires a numeric value' });

export function assertTimeOrder(startedAt: string, endedAt: string | null): void {
  if (endedAt !== null && Date.parse(endedAt) < Date.parse(startedAt)) {
    throw new Error('endedAt must be at or after startedAt');
  }
}

export function assertEventTimeShape(eventKind: 'point' | 'duration', startedAt: string, endedAt: string | null): void {
  assertTimeOrder(startedAt, endedAt);
  if (eventKind === 'point' && endedAt === null) {
    throw new Error('Point events must have an end time equal to their start time');
  }
  if (eventKind === 'point' && Date.parse(endedAt!) !== Date.parse(startedAt)) {
    throw new Error('Point events must have identical start and end times');
  }
}

export const seriesQuerySchema = z.object({
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  bucket: z.string().regex(/^\d+\s+(minute|minutes|hour|hours|day|days|week|weeks)$/).default('1 hour'),
  timeZone: timeZoneSchema.default('UTC'),
  displayUnitKey: unitKeySchema.optional()
});
