import { unauthorized } from "next/navigation";

export async function GET() {
  unauthorized();
}
