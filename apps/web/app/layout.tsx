import ClientTracing from '@repro/client-observability/client-tracing';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ClientTracing />
      </body>
    </html>
  );
}
