export function chunkItems(items: string[], size: number) {
  const chunks: string[][] = [];
  for (let offset = 0; offset <= items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}
