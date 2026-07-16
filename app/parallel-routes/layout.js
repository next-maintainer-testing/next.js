export default function ParallelRoutesLayout(props) {
  return (
    <main>
      {props.children}
      {props['parallel-panel']}
    </main>
  )
}
