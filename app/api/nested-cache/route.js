import { unstable_cache } from "next/cache";

let innerExecutions = 0;
let outerExecutions = 0;

const readInner = unstable_cache(
  async () => ({ execution: ++innerExecutions, createdAt: Date.now() }),
  ["issue-77412-inner"],
  { revalidate: 60 }
);

const readOuter = unstable_cache(
  async () => ({
    execution: ++outerExecutions,
    createdAt: Date.now(),
    inner: await readInner(),
  }),
  ["issue-77412-outer"],
  { revalidate: 2 }
);

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readOuter());
}
