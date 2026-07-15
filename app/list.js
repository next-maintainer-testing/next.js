import React from 'react'
import Item from './item'

export default function List({ children }) {
  const observations = React.Children.map(children, (child) => ({
    typeKind: typeof child.type,
    typeName: child.type?.name ?? null,
    displayName: child.type?.displayName ?? null,
    sameReference: child.type === Item,
  }))

  return <pre id="observation">{JSON.stringify(observations)}</pre>
}
