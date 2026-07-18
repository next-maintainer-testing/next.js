'use client';

import { useState } from 'react';

export default function Client2() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <div>Count {count}</div>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
