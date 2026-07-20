import FilterProvider from './FilterProvider'
import Header from './Header'

export default function Page() {
  return (
    <FilterProvider>
      <Header />
    </FilterProvider>
  )
}
