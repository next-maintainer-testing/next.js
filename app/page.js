import { ClientForm } from "./client-form";

async function action() {
  "use server";
}

class Foo {}

export default function Page() {
  return <ClientForm action={action.bind(null, new Foo())} />;
}
