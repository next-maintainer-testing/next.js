import { ClientComponent } from './components/client';
import { ServerComponent } from './components/server';

export default function Page() {
  const data = [
    { name: 'John Doe', age: 30 },
    { name: 'Jane Doe', age: 25 },
  ];

  return (
    <ClientComponent data={data}>
      <ServerComponent data={data} />
    </ClientComponent>
  );
}
