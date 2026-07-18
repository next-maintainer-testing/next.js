"use client";

import { useSelectedLayoutSegments } from "next/navigation";

export default function ExampleLayout({ children, header }) {
  const headerSegments = useSelectedLayoutSegments("header");
  const result = headerSegments.join("|");

  return (
    <main>
      <p id="segments" data-result={result}>
        Header segments: {JSON.stringify(headerSegments)}
      </p>
      <section>{header}</section>
      <section>{children}</section>
    </main>
  );
}
