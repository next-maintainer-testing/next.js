import { NextResponse } from "next/server";
import { makeErrorResponse } from "../../../lib/error";

export async function GET() {
  try {
    return NextResponse.json({}, { status: 200 });
  } catch (error) {
    return makeErrorResponse(error);
  }
}
