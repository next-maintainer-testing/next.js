"use client";

import { randomUUID } from "crypto";

export default function Home() {
  const uuid = randomUUID();
  console.log("randomUUID", uuid);

  return (
    <main>
      <h1>Crypto polyfill reproduction</h1>
      <output id="uuid" data-uuid={uuid}>{uuid}</output>
    </main>
  );
}
