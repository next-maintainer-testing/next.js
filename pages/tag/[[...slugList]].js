import Link from 'next/link';
import { useRouter } from 'next/router';

export default function TagPage() {
  const router = useRouter();

  return (
    <main>
      <Link href={router.asPath} locale="en">English</Link>
      <Link href={router.asPath} locale="es">Español</Link>
    </main>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
