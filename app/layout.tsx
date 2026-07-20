import type { ReactNode } from "react";

export default function Layout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {modal}
        {children}
      </body>
    </html>
  );
}
