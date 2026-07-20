'use client'

import {
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Button,
} from '@fluentui/react-components'

export default function Home() {
  return (
    <main>
      <Popover>
        <PopoverTrigger disableButtonEnhancement>
          <Button>Popover trigger</Button>
        </PopoverTrigger>
        <PopoverSurface>Popover content marker</PopoverSurface>
      </Popover>
    </main>
  )
}
