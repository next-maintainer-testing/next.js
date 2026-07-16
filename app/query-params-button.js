"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function QueryParamsButton() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  function updateQueryParams() {
    const params = new URLSearchParams(searchParams);
    params.set("random", Math.random().toString());
    router.push(`${pathname}?${params.toString()}`);
  }

  return <button onClick={updateQueryParams}>Update Query Params</button>;
}
