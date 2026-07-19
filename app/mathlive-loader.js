"use client";

import dynamic from "next/dynamic";

const MathLive = dynamic(() => import("./mathlive"), { ssr: false });

export default function MathLiveLoader() {
  return <MathLive />;
}
