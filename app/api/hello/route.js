const error = new Error("module-scope ENOENT reproduction");
error.code = "ENOENT";
throw error;

export async function GET() {
  return Response.json({ message: "ok" });
}
