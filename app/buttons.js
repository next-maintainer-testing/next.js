'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { noopAction } from './actions'

export default function Buttons({ href }) {
  const router = useRouter()
  return (
    <>
      <Link href={href}>{'<Link />'}</Link>
      <button
        type="button"
        onClick={async () => {
          await noopAction()
          router.push(href)
        }}
      >
        await noopAction() router.push(href)
      </button>
    </>
  )
}
