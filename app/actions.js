'use server'

export async function loadNextPage(page) {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return {
    page,
    items: Array.from({ length: 20 }, (_, index) => `character-${page}-${index}`),
    hasMore: page < 3
  }
}