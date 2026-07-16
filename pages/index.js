import styled from '@emotion/styled'

const Card = styled.main`
  color: rgb(100, 149, 237);
  background: rgb(255, 255, 255);
  padding: 48px;
  border: 8px solid rgb(144, 238, 144);
`

export default function Home() {
  return <Card id="emotion-card">Emotion styles should exist at first paint</Card>
}
