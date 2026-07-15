import { db } from '../database/connect';

export default function Page() {
  return (
    <main>
      <h1>Database connection</h1>
      <p data-connection-id={db.id}>Connected</p>
    </main>
  );
}
