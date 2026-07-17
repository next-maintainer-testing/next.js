import { Modal } from './modal';

export default function PhotoModal({ params }) {
  console.log(`Rendering PhotoModal at ${new Date().toISOString()}`);
  return <Modal>{params.id}</Modal>;
}
