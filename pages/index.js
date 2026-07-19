import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getSnapshot = () => 'client snapshot'

export default function Home() {
  const value = useSyncExternalStore(subscribe, getSnapshot)
  return <main>{value}</main>
}
