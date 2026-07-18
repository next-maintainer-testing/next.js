'use client';

import { useEffect, useState } from 'react';

export default function Reviews() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const first = setTimeout(() => setIndex(1), 300);
    const second = setTimeout(() => setIndex(2), 600);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, []);

  return <p id="review-index" data-index={index}>Review {index}</p>;
}
