'use server';

import { revalidateTag } from 'next/cache';

export async function doNothing() {}

export async function invalidateUnrelatedTag() {
  revalidateTag('tag-not-used-by-either-route');
}
