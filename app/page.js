import { Suspense } from "react";
import QueryParamsButton from "./query-params-button";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function FirstAsyncComponent() {
  await delay(2500);
  return <div>First Async Component</div>;
}

async function SecondAsyncComponent() {
  await delay(2500);
  return (
    <div>
      <div>Second Async Component</div>
      <QueryParamsButton />
    </div>
  );
}

export default async function Page({ searchParams }) {
  const params = await Promise.resolve(searchParams);

  return (
    <main>
      <p>
        With both independent Suspense boundaries rendered, changing the query
        parameter should immediately reset the keyed second boundary.
      </p>
      <Suspense fallback={<div>Loading first component...</div>}>
        <FirstAsyncComponent />
      </Suspense>
      <Suspense
        key={JSON.stringify(params)}
        fallback={<div>Loading second component...</div>}
      >
        <SecondAsyncComponent />
      </Suspense>
    </main>
  );
}
