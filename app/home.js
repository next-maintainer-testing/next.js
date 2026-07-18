'use client'

let request

function loadMessage() {
  request ??= fetch(`${window.location.origin}/message.txt`).then((response) =>
    response.text()
  )
  return request
}

export default function Home() {
  throw loadMessage()
}
