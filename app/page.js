import { Suspense } from "react";
import Link from "next/link";
import { ClientComponent } from "./ClientComponent";
import { SuspenseFallback } from "./SuspenseFallback";

export default async function Page({ searchParams }) {
  const { page = "2" } = await searchParams;
  return <>
    <Link prefetch={false} href="/?page=1">Page 1 with fetch</Link><br />
    <Link prefetch={false} href="/?page=2">Page 2 with timeout</Link>
    <Suspense fallback={<SuspenseFallback />} key={`page-${page}`}>
      {page === "1" ? <WithFetch /> : <WithTimeout />}
    </Suspense>
  </>;
}

async function WithFetch() {
  await fetch(`${process.env.REPRO_ORIGIN}/api/data`, { cache: "no-store" });
  return <ClientComponent />;
}

async function WithTimeout() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <ClientComponent />;
}
