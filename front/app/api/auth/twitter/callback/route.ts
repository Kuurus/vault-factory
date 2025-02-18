import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/config/env'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const storedState = request.cookies.get('twitter_oauth_state')?.value

    // Validate state to prevent CSRF attacks
    if (!state || !storedState || state !== storedState) {
      return NextResponse.json(
        { error: 'Invalid state parameter' },
        { status: 400 }
      )
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${env.TWITTER_CLIENT_ID}:${env.TWITTER_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        code: code!,
        grant_type: 'authorization_code',
        redirect_uri: env.NEXT_PUBLIC_APP_URL + '/api/auth/twitter/callback',
        code_verifier: state!, // Using state as code_verifier since we used plain challenge method
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token')
    }

    const tokens = await tokenResponse.json()

    // Get user info using the access token
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user data')
    }

    const userData = await userResponse.json()

    // Here:
    // 1. Store the tokens securely
    // 2. Create or update user in database?
    // 3. Create a session or JWT?

    // For now, we'll just return success with the user data
    const response = NextResponse.redirect(
      `https://cyrusvale.vercel.app/auth/success`
    )

    // Clear the state cookie
    response.cookies.delete('twitter_oauth_state')

    return response

  } catch (error) {
    console.error('Twitter OAuth error:', error)
    return NextResponse.redirect(
      `https://cyrusvale.vercel.app/auth/failure`
    )
  }
} 