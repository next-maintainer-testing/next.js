import BreadcrumbsProvider from '../components/breadcrumbs-provider';

export default function RootLayout({ children, breadcrumbs }) {
  return (
    <html lang="en">
      <body>
        <BreadcrumbsProvider breadcrumbs={breadcrumbs}>
          {children}
        </BreadcrumbsProvider>
      </body>
    </html>
  );
}
