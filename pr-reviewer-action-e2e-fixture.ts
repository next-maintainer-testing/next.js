export function chunkItems<T>(items: T[], size: number): T[][] {
  // This disposable change exists only to verify stale-head rejection.
  const chunks: T[][] = [];
  for (let offset = 0; offset <= items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}
