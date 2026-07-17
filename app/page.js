import dynamic from "next/dynamic"

const Button = dynamic(() =>
  import("../components/Button").then((module) => module.Button)
)

export default function Page() {
  return <Button />
}
