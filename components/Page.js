import Router from "next/router";
import { observer } from "mobx-react-lite";
import { useStore } from "./StoreProvider";

const Page = observer(function Page() {
  const store = useStore();
  return (
    <main>
      <button onClick={() => Router.push("/ssg/1")}>first</button>
      <button onClick={() => Router.push("/ssg/2")}>two</button>
      <div>{JSON.stringify(store.photos)}</div>
    </main>
  );
});

export default Page;
