'use client';

import { useActionState, useRef } from 'react';
import { forgotPassword } from './actions';

export function ForgotPasswordForm() {
  const [, formAction] = useActionState(forgotPassword, {});
  const formRef = useRef(null);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        formRef.current?.submit();
      }}
    >
      <div>
        <label htmlFor="email">Your email</label>
        <input id="email" name="email" type="email" required />
      </div>
      <button type="submit">Reset password</button>
    </form>
  );
}
