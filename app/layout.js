import ClientPerformanceAnalytics from './performance-analytics'

export const metadata = { title: 'PerformanceObserver reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ClientPerformanceAnalytics />
      </body>
    </html>
  )
}
