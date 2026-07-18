export type PostgreSqlError = {
  code?: string;
};

export function isPostgreSqlError(error: unknown): error is PostgreSqlError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function hasPostgreSqlErrorCode(error: unknown, code: string): boolean {
  return isPostgreSqlError(error) && error.code === code;
}
