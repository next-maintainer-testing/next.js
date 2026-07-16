export default async function ParallelCatchAll({ params }) {
  return <p id="parallel-params">{JSON.stringify(await params)}</p>;
}
