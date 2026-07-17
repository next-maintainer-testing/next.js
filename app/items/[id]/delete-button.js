'use client'

import { useRouter } from 'next/navigation'
import { deleteItem } from '../../actions'

export default function DeleteButton() {
  const router = useRouter()

  async function deleteAndNavigate() {
    await deleteItem()
    router.push('/')
  }

  return <button onClick={deleteAndNavigate}>Delete with client-side router.push</button>
}
