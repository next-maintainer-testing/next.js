import { Modal } from './modal';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `Photo ${id} intercepted` };
}

export default async function PhotoModal({ params }) {
  const { id } = await params;
  return <Modal>{id}</Modal>;
}
