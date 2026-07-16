'use server'

export async function slowAction() {
  await new Promise((resolve) => setTimeout(resolve, 3000))
  return 'done'
}
