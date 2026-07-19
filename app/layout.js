"use client";

import { useState } from "react";

export const metadata = {
  title: "Issue 55473 reproduction",
};

export default function RootLayout({ children }) {
  const [showHeader, setShowHeader] = useState(true);

  return (
    <html lang="en">
      <body>
        <button onClick={() => setShowHeader((value) => !value)}>
          Toggle header
        </button>
        {showHeader ? <header>Header</header> : null}
        {children}
      </body>
    </html>
  );
}
