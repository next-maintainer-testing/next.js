'use client';

import { useState } from 'react';
import { ForgotPasswordForm } from './form';

export default function Page() {
  const [toggle, setToggle] = useState(false);

  return (
    <main>
      <p>Working Form: No Conditional Rendering</p>
      <ForgotPasswordForm />
      <p>Broken Form: Conditional Rendering</p>
      <button type="button" onClick={() => setToggle((shown) => !shown)}>
        Toggle conditional form
      </button>
      {toggle && <ForgotPasswordForm />}
    </main>
  );
}
