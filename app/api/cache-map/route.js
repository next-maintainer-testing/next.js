import { unstable_cache } from 'next/cache';

const fruits = ['apple', 'banana', 'cherry', 'dragonfruit'];

export async function GET(request) {
  const sortOrder = request.nextUrl.searchParams.get('sort') || 'asc';
  const configMap = new Map([['sortOrder', sortOrder]]);
  const cachedData = unstable_cache(
    async (config) => config.get('sortOrder') === 'desc' ? [...fruits].reverse() : [...fruits],
    ['fruits-data'],
  );

  return Response.json({ data: await cachedData(configMap) });
}
