export default async function handler(_request, response) {
  try {
    await response.revalidate('/')
    response.status(200).json({ revalidated: true })
  } catch (error) {
    response.status(500).json({ revalidated: false, message: String(error) })
  }
}
