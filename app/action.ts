'use server';

import { createSafeActionClient } from 'next-safe-action';
import { z } from 'zod';

const actionClient = createSafeActionClient();
const things = { first: 'first', second: 'second' } as const;

export const $serverAction = actionClient
  .schema(
    z.object({
      things: z.enum(
        Object.entries(things).map(([kind]) => kind) as [string, ...string[]],
      ),
    }),
  )
  .action(async () => ({ ok: true }));
