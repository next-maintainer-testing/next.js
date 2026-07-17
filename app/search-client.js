'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function SearchClient() {
  const [query, setQuery] = useState('item')
  const [results, setResults] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => setResults(data.results))
      .catch((error) => {
        if (error.name !== 'AbortError') throw error
      })
    return () => controller.abort()
  }, [query])

  return (
    <main>
      <h1 data-page="search">Search Page</h1>
      <label>
        Search
        <input
          aria-label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul>
        {results.map((result) => (
          <li key={result.id}>
            <Link href={`/detail/${result.id}`}>{result.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
