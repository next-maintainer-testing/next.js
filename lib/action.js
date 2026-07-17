'use server'

import { readState } from './index'

export async function serverFunction() {
  return readState()
}
