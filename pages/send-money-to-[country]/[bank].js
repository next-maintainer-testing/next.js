import React from 'react'

export async function getServerSideProps({ params }) {
  return {
    props: {
      country: params.country,
      bank: params.bank,
    },
  }
}

export default function SendMoney({ country, bank }) {
  return React.createElement(
    'main',
    { id: 'route-result' },
    `send-money-route:country=${country}:bank=${bank}`
  )
}
