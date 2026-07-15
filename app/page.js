"use client";

import { readMore } from "./actions";

export default function Page() {
  return <button onClick={() => readMore()}>Run server action</button>;
}
