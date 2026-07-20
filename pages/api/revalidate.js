export default function handler(req, res) {
  res.status(200).json({
    bodyType: typeof req.body,
    body: req.body,
  })
}
