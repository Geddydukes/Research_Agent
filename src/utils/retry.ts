export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { tries?: number; baseMs?: number; maxMs?: number }
): Promise<T> {
  const tries = opts?.tries ?? 6;
  const baseMs = opts?.baseMs ?? 500;
  const maxMs = opts?.maxMs ?? 8000;
  let lastErr: unknown;

  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e as any)?.message ?? '');
      const is429 =
        msg.includes(' 429 ') ||
        msg.includes('"code": "429"') ||
        msg.toLowerCase().includes('too many requests');
      const is5xx =
        msg.includes(' 500 ') ||
        msg.includes(' 502 ') ||
        msg.includes(' 503 ') ||
        msg.includes(' 504 ');
      if (!is429 && !is5xx) {
        throw e;
      }
      const jitter = Math.floor(Math.random() * 250);
      const delay = Math.min(maxMs, baseMs * Math.pow(2, i)) + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}


