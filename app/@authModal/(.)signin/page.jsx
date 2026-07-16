"use client";

export default function InterceptedSignIn() {
  return (
    <div role="dialog" data-testid="intercepted-signin-modal">
      <h2>Sign in</h2>
      <p>Modal opened via intercepting route</p>
    </div>
  );
}
