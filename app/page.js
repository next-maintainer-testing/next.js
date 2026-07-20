'use client';

import { useEffect } from 'react';

export default function Page() {
  useEffect(() => {
    console.log('ISSUE_74977_APP_MOUNTED');
    return () => console.log('ISSUE_74977_APP_UNMOUNTED');
  }, []);

  return <main>Issue 74977 Strict Mode effect lifecycle reproduction</main>;
}
