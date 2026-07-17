import { connection } from "next/server";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function DynamicPage() {
  await connection();
  await wait(1500);
  return (
    <main>
      <h1 id="dynamic-ready">Dynamic page ready</h1>
    </main>
  );
}
