'use client';

import { useMemo } from 'react';

const decideZoomByAccuracy = (range) => {
  const isUnder = (accuracy) => range <= accuracy;

  if (isUnder(0)) return 15;
  if (isUnder(50)) return 15;
  if (isUnder(100)) return 15;
  return 11;
};

export default function Page() {
  const zoom = useMemo(() => decideZoomByAccuracy(75), []);
  return <p>Zoom: {zoom}</p>;
}
