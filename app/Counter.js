'use client';

import { useState } from 'react';

export function Counter({ incrementAction }) {
  const [count, setCount] = useState(0);
  return (
    <>
      <p>Count: {count}</p>
      <button onClick={async () => setCount(await incrementAction(count))}>Increment</button>
    </>
  );
}
