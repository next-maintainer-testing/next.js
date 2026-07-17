import { useRouter } from "next/router";

export default function Car() {
  const router = useRouter();
  return <main id="car-page">Car {router.query.id}</main>;
}
