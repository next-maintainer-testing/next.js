async function getData() {
  "use cache";
  return "cache-dynamic-ok";
}

export default async function CachedHeader() {
  return <h1>{await getData()}</h1>;
}
