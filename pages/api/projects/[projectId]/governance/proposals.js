export default function handler(req, res) {
  res.status(200).json({ projectId: req.query.projectId });
}
