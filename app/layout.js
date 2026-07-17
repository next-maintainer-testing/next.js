import localFont from "next/font/local";

const spaceGrotesk = localFont({
  src: "./SpaceGroteskTrimmed.woff2",
  preload: true,
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={spaceGrotesk.className}>
      <body>{children}</body>
    </html>
  );
}
