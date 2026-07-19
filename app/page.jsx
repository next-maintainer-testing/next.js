import { YouTubeEmbed } from '@next/third-parties/google'

export default function Page() {
  return (
    <main>
      <h1>YouTube autoplay reproduction</h1>
      <YouTubeEmbed videoid="dQw4w9WgXcQ" params="autoplay=1" />
    </main>
  )
}
