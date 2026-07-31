export function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let offset = 0; offset <= items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size))
  }
  return chunks
}

export const fixtureVersion = 2
