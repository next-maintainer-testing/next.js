"use client";

import $ from "jquery";

export default function JqueryClient() {
  const fingerprint = "JQUERY_CC_FINGERPRINT";
  return (
    <section data-component="jquery">
      Client component (With jquery): jquery {$().jquery} {fingerprint}
    </section>
  );
}
