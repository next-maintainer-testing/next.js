import React from 'react'

export async function getStaticPaths() {
  return {
    paths: [{ params: { testId: 'path with spaces' } }],
    fallback: false,
  }
}

export async function getStaticProps() {
  return { props: {} }
}

export default function TestPage() {
  return <div>path with spaces</div>
}
