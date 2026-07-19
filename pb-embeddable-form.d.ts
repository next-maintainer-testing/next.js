import type React from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'pb-embeddable-form': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        id: string
      }
    }
  }
}

export {}
