import { handleLanguageCallback, handleCustomEmojisInput } from "@/handlers/language";
import { handleStart, handleHelp, handleLangCommand } from "@/handlers/commands";
import { handleReactionCallback } from "@/handlers/reactions";
import { handleMessageDownloader } from "@/handlers/downloader";
import { ensureYtDlpBinary } from "@/downloader/bin";
import type { CustomContext } from "@/i18n";
import { i18nMiddleware } from "@/i18n";
import { autoRetry } from "@grammyjs/auto-retry";
import { CONFIG } from "@/config";
import { Bot } from "grammy";
import { initDb } from "@/db";

async function main() {
    console.log('🚀 Starting Telegram Video Downloader Bot (Node.js + grammY)…')

    if (!CONFIG.BOT_TOKEN) {
        console.error('❌ Error: BOT_TOKEN is missing in environment or .env file!')
        return
    }

    try {
        await initDb()
    } catch (err) {
        console.warn('⚠️ Non-fatal issue during DB initialization:', err)
    }

    try {
        await Promise.race([
            ensureYtDlpBinary(),
            new Promise((res) => setTimeout(res, 10000))
        ])
    } catch (err) {
        console.warn('⚠️ Non-fatal issue ensuring yt-dlp binary:', err)
    }

    const bot = new Bot<CustomContext>(CONFIG.BOT_TOKEN)

    bot.api.config.use(autoRetry())
    bot.use(i18nMiddleware)

    bot.command(['start', 'settings'], handleStart)
    bot.command('help', handleHelp)
    bot.command('lang', handleLangCommand)

    bot.on('callback_query:data', async (ctx, next) => {
        const data = ctx.callbackQuery?.data
        if (data?.startsWith('react:')) {
            await handleReactionCallback(ctx)
            return
        }
        await handleLanguageCallback(ctx)
        return next()
    })

    bot.use(handleCustomEmojisInput)
    bot.use(handleMessageDownloader)

    bot.catch((err) => {
        console.error(`❌ Error in bot execution [update_id: ${err.ctx.update.update_id}]:`, err.error)
    })

    console.log('🤖 Bot is active and listening for messages…')
    await bot.start({
        drop_pending_updates: true,
        onStart: (botInfo) => {
            console.log(`✅ Logged in as @${botInfo.username} (${botInfo.first_name})`)
        }
    })
}

main().catch((err) => {
    console.error('💥 Error on startup:', err)
})
