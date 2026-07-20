import React from 'react'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export async function getStaticProps(context) {
  return {
    props: { path: JSON.stringify(context.params) },
    revalidate: 60,
  }
}

export default function Page({ path }) {
  return <main id="params">{path}</main>
}
