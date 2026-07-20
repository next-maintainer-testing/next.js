import pLimit from 'p-limit';

export default async function Page() {
  const limit = pLimit(1);
  const result = await limit(async () => 'p-limit completed');

  return <main>{result}</main>;
}
