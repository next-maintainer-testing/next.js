'use client';

import { memo, useState } from 'react';
import { useRouter } from 'next/navigation';

function nextMountId() {
  globalThis.__issue73507MountId = (globalThis.__issue73507MountId || 0) + 1;
  return globalThis.__issue73507MountId;
}

function Base({ kind }) {
  const [mountId] = useState(nextMountId);
  return <p id={kind} data-mount-id={mountId}>{kind}: {mountId}</p>;
}

export function Normal() {
  return <Base kind="normal" />;
}

export const DirectMemo = memo(function DirectMemo() {
  return <Base kind="direct-memo" />;
});

const InnerMemo = memo(function InnerMemo() {
  return <Base kind="indirect-memo" />;
});

export function IndirectMemo() {
  return <InnerMemo />;
}

export function RefreshButton() {
  const router = useRouter();
  return <button id="refresh" onClick={() => router.refresh()}>router.refresh()</button>;
}
