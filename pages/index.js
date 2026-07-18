import Link from 'next/link';
import { home } from '../styles/home.css';

export default function Home() {
  return (
    <main>
      <h1 className={home}>Home page</h1>
      <Link id="to-other" href="/other">Go to other page</Link>
    </main>
  );
}
