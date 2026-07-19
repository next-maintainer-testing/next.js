"use server"

import { cookies } from "next/headers"

export default async function Page() {
  async function setCookieServerAction() {
    "use server"
    cookies().set("test", "1234", {})
  }

  await setCookieServerAction()
  return null
}
