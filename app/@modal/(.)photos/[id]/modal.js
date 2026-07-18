'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ children }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);
  return createPortal(<dialog ref={dialogRef}>{children}</dialog>, document.getElementById('modal-root'));
}
