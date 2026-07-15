import variables from './variables.module.scss'

export default function Page() {
  const primaryColor = variables.primaryColor

  return (
    <main id="result" data-primary-color={primaryColor ?? 'missing'}>
      {primaryColor ?? 'missing'}
    </main>
  )
}
