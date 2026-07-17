import { Suspense } from "react";

export default function RootLayout({ children, modal }) {
  return (
    <html>
      <body>
        <Suspense fallback={null}>{children}</Suspense>
        <Suspense fallback={null}>{modal}</Suspense>
      </body>
    </html>
  );
}
