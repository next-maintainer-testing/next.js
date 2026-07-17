import { GoogleMapsEmbed } from '@next/third-parties/google'

export default function Page() {
  return (
    <GoogleMapsEmbed
      apiKey="TEST_KEY"
      height={200}
      width="100%"
      mode="directions"
      origin="Brooklyn+Bridge,New+York,NY"
      destination="Paris,France"
    />
  )
}
