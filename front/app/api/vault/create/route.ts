import { analyzeText } from '@/agent/llm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const createVaultSchema = z.object({
  tweet: z.string().url().refine(
    (url) => url.includes('twitter.com') || url.includes('x.com'),
    'Must be a valid Twitter/X URL'
  ),
  text: z.string().min(1, 'Tweet text is required')
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = createVaultSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: 'Validation error',
          errors: result.error.issues
        },
        { status: 400 }
      )
    }

    const analysis = await analyzeText(result.data.text)

    return NextResponse.json({
      success: true,
      vaultId: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9',
      message: 'Tweet parsed successfully',
      tweet: {
        id: '1754645898637123456',
        text: result.data.text,
        author: {
          id: '44196397',
          username: 'cryptotrader',
          name: 'Crypto Trader'
        },
        created_at: '2024-02-07T12:00:00Z',
        url: result.data.tweet
      },
      parsedAssets: analysis.parsedAssets,
      createdAt: '2024-02-08T12:00:00Z',
      transactionHash: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
      blockNumber: 19123456,
      timestamp: '2024-02-08T12:00:00Z'
    })

  } catch (error) {
    console.error(error)
    return NextResponse.json(
      {
        success: false,
        vaultId: '',
        tweet: null,
        message: 'Invalid tweet URL or tweet not found',
        errorCode: 'INVALID_TWEET'
      },
      { status: 400 }
    )
  }
}
