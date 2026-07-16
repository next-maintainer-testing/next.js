import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  const data = {
    url: '/walk-in-dining',
    title: 'Walk-in Dining',
    image: '/card.svg',
  };

  return (
    <main>
      <Link href={data.url}>
        <div className="card">
          <span className="title">{data.title}</span>
          <div className="image-wrapper">
            <Image
              src={data.image}
              width={88}
              height={56}
              alt={data.title}
            />
          </div>
        </div>
      </Link>
    </main>
  );
}
