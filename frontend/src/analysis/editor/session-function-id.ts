export type SessionFunctionCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

function fallbackId(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2);
  return `local-${time}-${random}`;
}

export function createSessionFunctionId(
  source: SessionFunctionCrypto | undefined = globalThis.crypto,
): string {
  if (typeof source?.randomUUID === 'function') {
    return source.randomUUID();
  }

  if (typeof source?.getRandomValues !== 'function') {
    return fallbackId();
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(
    bytes,
    (value: number): string => value.toString(16).padStart(2, '0'),
  ).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
