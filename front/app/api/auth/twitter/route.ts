import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/config/env'

const CALLBACK_URL = env.NEXT_PUBLIC_APP_URL + '/api/auth/twitter/callback'

export async function GET(request: NextRequest) {
  const state = crypto.randomUUID()
  
  const authUrl = new URL('https://twitter.com/i/oauth2/authorize')
  authUrl.searchParams.append('response_type', 'code')
  authUrl.searchParams.append('client_id', env.TWITTER_CLIENT_ID)
  authUrl.searchParams.append('redirect_uri', CALLBACK_URL)
  authUrl.searchParams.append('scope', 'tweet.read users.read offline.access')
  authUrl.searchParams.append('state', state)
  authUrl.searchParams.append('code_challenge_method', 'plain')
  authUrl.searchParams.append('code_challenge', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('twitter_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10 // 10 minutes
  })

  return response
}