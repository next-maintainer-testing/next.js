"use client"

import { useState } from "react"

function labeled(label: string) {
  return function <T extends new (...args: any[]) => object>(value: T) {
    return class extends value {
      label = label
    }
  }
}

@labeled("decorated")
class DecoratedValue {
  label = "plain"
}

export default function Page() {
  const [value] = useState(() => new DecoratedValue())
  return <main>{value.label}</main>
}
