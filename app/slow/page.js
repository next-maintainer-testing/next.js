const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export default async function SlowPage() {
  await wait(1200);
  return <h1 id="slow-page">Slow route loaded</h1>;
}
