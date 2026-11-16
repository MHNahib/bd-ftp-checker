/**
 * Run `fn` over `items` with at most `limit` in flight. Results keep input order.
 * Stops picking new items once `signal` aborts (in-flight ones finish).
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const size = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      if (signal?.aborted) return;
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  }

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
