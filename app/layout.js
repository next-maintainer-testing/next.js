import Menu from './Menu';

export const revalidate = 15;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Menu />
        <main>{children}</main>
      </body>
    </html>
  );
}
