import React from 'react'

function ESIInclude(props) {
  return React.createElement('esi:include', props)
}

export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>
        {children}
        <ESIInclude src="foo.bar" />
      </body>
    </html>
  )
}
