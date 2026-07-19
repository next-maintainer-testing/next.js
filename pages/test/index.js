import { useRef } from 'react'
import dynamic from 'next/dynamic'

const DynamicTarget = dynamic(import('../../components/DynamicTarget'), { ssr: true })

export default function TestPage() {
  const targetRef = useRef()
  return <DynamicTarget ref={targetRef} />
}
