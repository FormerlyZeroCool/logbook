import { Ajv } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });
const point = {
  type: 'object', required: ['time', 'timeMs', 'value', 'eventId', 'note', 'textValue', 'startedAt', 'endedAt', 'inRequestedRange'], additionalProperties: false,
  properties: {
    time: { type: 'string' }, timeMs: { type: 'number' }, value: { type: ['number', 'null'] }, eventId: { type: ['string', 'null'] }, note: { type: ['string', 'null'] }, textValue: { type: ['string', 'null'] }, startedAt: { type: ['string', 'null'] }, endedAt: { type: ['string', 'null'] }, inRequestedRange: { type: 'boolean' }
  }
};
const unit = { type: ['object', 'null'], properties: { key: { type: 'string' }, symbol: { type: 'string' }, dimensionKey: { type: 'string' } }, required: ['key', 'symbol', 'dimensionKey'], additionalProperties: false };
const series = { type: 'object', required: ['kind', 'key', 'label', 'unit', 'points'], properties: { kind: { const: 'series' }, key: { type: ['string', 'null'] }, label: { type: 'string' }, unit, points: { type: 'array', items: point } }, additionalProperties: false };
export const analysisResultSchema = {
  oneOf: [
    { type: 'object', required: ['kind', 'value', 'label', 'unit', 'description'], properties: { kind: { const: 'scalar' }, value: { type: ['number', 'string', 'null'] }, label: { type: ['string', 'null'] }, unit, description: { type: ['string', 'null'] } }, additionalProperties: false },
    series,
    { type: 'object', required: ['kind', 'title', 'series'], properties: { kind: { const: 'series-set' }, title: { type: ['string', 'null'] }, series: { type: 'array', items: series } }, additionalProperties: false }
  ]
};
const validate = ajv.compile(analysisResultSchema);
export function validateSerializedOutput(value: unknown): { valid: boolean; errors: string[] } {
  const valid = validate(value);
  return { valid: Boolean(valid), errors: (validate.errors ?? []).map((error: { instancePath?: string; message?: string }) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`) };
}
