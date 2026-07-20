import { runWithLayoutTrace } from "./trace";

export const metadata = {
  title: "Next.js issue 71601 reproduction",
};

export default function RootLayout({ children }) {
  return runWithLayoutTrace(() => (
    <html lang="en">
      <body>{children}</body>
    </html>
  ));
}
