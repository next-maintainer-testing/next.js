import { fetchBackendId } from '../server/backend';

export default function A({ backendId }) {
  return <div id="backend-id">{backendId}</div>;
}

export function getServerSideProps() {
  return { props: { backendId: fetchBackendId() } };
}
