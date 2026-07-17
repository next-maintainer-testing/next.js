import Shortcut from "./shortcut";

export default function RootLayout({ children, modal }) {
  return (
    <html lang="en">
      <body>
        {children}
        {modal}
        <Shortcut />
      </body>
    </html>
  );
}
