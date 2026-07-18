import React from 'react'

export async function getServerSideProps({ params, query }) {
  return {
    props: {
      id: params.id,
      type: query.type ?? null,
    },
  }
}

export default function Transaction({ id, type }) {
  return React.createElement(
    'main',
    { id: 'route-result' },
    `transactions-route:id=${id}:type=${type}`
  )
}
