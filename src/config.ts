import "dotenv/config";

export interface Config {
    BOT_TOKEN: string
    DATABASE_URL: string
    DEFAULT_LANGUAGE: string
}

export const CONFIG: Config = {
    BOT_TOKEN: process.env.BOT_TOKEN ?? '',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/telegram_bot',
    DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE ?? 'en'
}

if (!CONFIG.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is missing in environment variables!')
}