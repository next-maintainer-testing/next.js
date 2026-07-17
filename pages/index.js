import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  return (
    <main>
      <p id="current-path">{router.asPath}</p>
      <button id="navigate" onClick={() => router.push("/cars/11841")}>
        Open car
      </button>
    </main>
  );
}
