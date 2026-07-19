export const dataInMemory = [
  { id: '1', value: 'item 1' },
  { id: '2', value: 'item 2' },
]

export async function fetchItems() {
  return dataInMemory
}
