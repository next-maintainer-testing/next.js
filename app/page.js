import { action } from "../actions";

export default function Page() {
  return (
    <form action={action}>
      <button>Submit</button>
    </form>
  );
}
