import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tweetUrl = searchParams.get('url');

    if (!tweetUrl) {
        return NextResponse.json(
            { error: 'Tweet URL is required' },
            { status: 400 }
        );
    }

    try {
        const response = await fetch(
            `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch tweet data');
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch tweet data' },
            { status: 500 }
        );
    }
}