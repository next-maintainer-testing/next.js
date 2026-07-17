import Link from "next/link";
import Header from "./header";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header linkComponent={Link} />
        {children}
      </body>
    </html>
  );
}
