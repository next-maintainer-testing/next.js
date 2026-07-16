'use client'

import { useRouter } from 'next/navigation'
import { slowAction } from './actions'

export default function ProfileLink({ id }) {
  const router = useRouter()
  const destination = id === '1' ? '2' : '1'
  return (
    <button id="navigate" onClick={async () => {
      router.push(`/profile/${destination}`)
      await slowAction()
    }}>
      Go to profile {destination}
    </button>
  )
}
