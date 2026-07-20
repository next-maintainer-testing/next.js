'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { loadNextPage } from './actions'

export default function ActionClient({ initialPage }) {
  const sentinel = useRef(null)
  const [inView, setInView] = useState(false)
  const query = useInfiniteQuery({
    queryKey: ['characters'],
    queryFn: ({ pageParam = 1 }) => loadNextPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialData: { pages: [initialPage], pageParams: [1] }
  })

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    const node = sentinel.current
    if (node) observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (inView && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }, [inView, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage])

  return (
    <section>
      <div id="page-count">{query.data?.pages.length ?? 0}</div>
      <div id="fetch-status">{query.isFetchingNextPage ? 'Fetching next page...' : 'Idle'}</div>
      {query.data?.pages.flatMap((page) => page.items).map((item) => (
        <article key={item} style={{ height: 100, border: '1px solid black' }}>{item}</article>
      ))}
      <div id="sentinel" ref={sentinel} style={{ height: 20 }}>load more</div>
    </section>
  )
}