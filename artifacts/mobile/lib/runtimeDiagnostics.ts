type RuntimeContext = Record<string, string | number | boolean | null | undefined>;

function sanitize(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(
      /(["']?)(sessionToken|guestToken|password|authorization|token)\1\s*[:=]\s*["']?[^"',\s}]+["']?/gi,
      '$2=[redacted]',
    )
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

/**
 * Device-only failures are often invisible in the Metro terminal. Keep one
 * safe, stage-labelled log format for diagnosing them without logging tokens,
 * URLs, passwords, or user data.
 */
export function reportRuntimeError(
  stage: string,
  error: unknown,
  context: RuntimeContext = {},
): void {
  const safeContext = Object.entries(context)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${sanitize(String(value))}`)
    .join(' ');
  const suffix = safeContext ? ` ${safeContext}` : '';
  console.error(`[FFC][${stage}] ${sanitize(errorMessage(error))}${suffix}`);
}