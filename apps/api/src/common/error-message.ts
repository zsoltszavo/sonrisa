/** The message of anything thrown, for logs and stored errors (`lastError`). */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
