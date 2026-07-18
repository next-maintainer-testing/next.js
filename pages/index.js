const { formattedDate } = require('@repro/pkg-using-date-fns')

export default function Home() {
  return <main>{formattedDate}</main>
}
