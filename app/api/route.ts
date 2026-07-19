import type { NextApiRequest, NextApiResponse } from "next";

export const revalidate = "asdf";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json("test");
}
