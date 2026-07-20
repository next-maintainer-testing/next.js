import ErrorBoundary from './error-boundary'

function ThrowingServerComponent() {
  throw new Error('ISSUE_58754_SERVER_COMPONENT_THROW')
}

export default function Page() {
  return (
    <main>
      <ErrorBoundary>
        <ThrowingServerComponent />
      </ErrorBoundary>
    </main>
  )
}
