'use client';

import { isValidElement, use } from 'react';
import { BreadcrumbsContext } from './breadcrumbs-context';

export function Content({ children }) {
  const breadcrumbs = use(BreadcrumbsContext);
  return (
    <main>
      {isValidElement(breadcrumbs) && breadcrumbs}
      <div>{children}</div>
    </main>
  );
}
