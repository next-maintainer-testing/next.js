import { NextResponse } from "next/server";
import { z } from "zod";
import { makeErrorResponse } from "../../../lib/error";

export async function POST() {
  try {
    return NextResponse.json(z.any().parse({}), { status: 200 });
  } catch (error) {
    return makeErrorResponse(error);
  }
}
