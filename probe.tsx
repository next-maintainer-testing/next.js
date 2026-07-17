import { useRouter } from 'next/navigation'

export function RouterPushReturnProbe() {
  const router = useRouter()

  // The reported behavior is that App Router push returns void, not a Promise.
  const navigationFinished: Promise<void> = router.push('/destination')
  void navigationFinished

  return null
}
