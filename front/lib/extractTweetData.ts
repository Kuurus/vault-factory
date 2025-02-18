// lib/extractTweetData.ts

export async function extractTweetText(tweetUrl: string): Promise<string> {
    try {
        const response = await fetch(
            `/api/tweet?url=${encodeURIComponent(tweetUrl)}`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch tweet');
        }

        const data = await response.json();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = data.html;

        // Remove any script tags
        const scripts = tempDiv.getElementsByTagName('script');
        while (scripts[0]) {
            scripts[0].parentNode?.removeChild(scripts[0]);
        }

        // Get clean text content
        const text = tempDiv.textContent?.trim() || '';

        // Remove extra whitespace and newlines
        return text.replace(/\s+/g, ' ');
    } catch (error) {
        console.error('Tweet extraction error:', error);
        throw error;
    }
}