'use server'

export async function failServerAction() {
  throw new Error('ISSUE_76803_SERVER_ACTION_FAILURE')
}
