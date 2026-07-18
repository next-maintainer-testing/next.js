"use client";

import { useSearchParams } from "next/navigation";

export function Footer() {
  const searchParams = useSearchParams();
  return <footer>Filter: {searchParams.get("filter") ?? "none"}</footer>;
}
