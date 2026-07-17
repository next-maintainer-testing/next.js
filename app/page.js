'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchData } from './actions';

export default function Page() {
  const router = useRouter();
  const [data, setData] = useState(null);

  useEffect(() => {
    async function getData() {
      const result = await fetchData();
      setData(result);
    }
    getData();
  }, []);

  function handleRefresh() {
    router.refresh();
    console.log('Refresh triggered');
  }

  return (
    <main>
      <h1 id="timestamp">
        {data ? `Timestamp: ${data.timestamp}` : 'Loading...'}
      </h1>
      <button id="refresh" onClick={handleRefresh}>Refresh Data</button>
    </main>
  );
}
