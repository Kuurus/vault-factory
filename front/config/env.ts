import dotenv from 'dotenv'
import path from 'path'

// Load .env file
dotenv.config({
  path: path.resolve(process.cwd(), '.env')
})

// Export environment variables with type checking
export const env = {
  TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID || '',
  TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET || '',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

// Validate required environment variables
const requiredEnvs = ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'] as const
for (const required of requiredEnvs) {
  if (!env[required]) {
    throw new Error(`Missing required environment variable: ${required}`)
  }
}