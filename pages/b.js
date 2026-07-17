import { fetchBackendId } from '../server/backend';

export default function B({ backendId }) {
  return <div id="backend-id">{backendId}</div>;
}

export function getServerSideProps() {
  return { props: { backendId: fetchBackendId() } };
}
