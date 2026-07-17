import React from "react";

export function GET() {
  console.log(
    `CLIENT_INTERNALS_VALUE_TYPE:${typeof React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE}`,
  );
  return new Response("ok");
}
