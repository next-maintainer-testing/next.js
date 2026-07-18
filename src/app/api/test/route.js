import { TwitterApi } from 'twitter-api-v2'

export const GET = async () => {
  new TwitterApi()
  return Response.json({})
}
