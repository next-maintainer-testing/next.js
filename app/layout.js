import MemoShell from './memo-shell';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <MemoShell>{children}</MemoShell>
      </body>
    </html>
  );
}
