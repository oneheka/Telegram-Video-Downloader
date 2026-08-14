import { getChatSettings, getUserSettings, getMediaMessage, getMessageReactions, toggleUserReaction, ReactionRecord } from "@/db";
import type { CustomContext } from "@/i18n";
import { InlineKeyboard } from "grammy";

export const ALL_REACTIONS = [
    '👍', '❤️', '🔥', '👏', '😍', '⚡️', '🎉', '👑', '🫡',
    '😂', '🤡', '💀', '🗿', '💅', '👀', '🤝',
    '💩', '🤮', '👎', '😱', '🤯', '🤬', '💔', '🥱'
]

export function buildReactionKeyboard(reactionButtons: string, counts: Map<string, number>): InlineKeyboard | undefined {
    const list = reactionButtons.split(',').map((e) => e.trim()).filter(Boolean)
    if (list.length === 0) {
        return undefined
    }
    const kb = new InlineKeyboard()

    let col = 0
    for (const emoji of list) {
        const count = counts.get(emoji) || 0
        const text = count > 0 ? `${emoji} ${count}` : emoji
        kb.text(text, `react:${emoji}`)
        col++
        if (col >= 4) {
            kb.row()
            col = 0
        }
    }
    return kb
}

export function formatReactionsCaption(baseCaption: string, records: ReactionRecord[]): string {
    const activeRecords = records.filter((r) => r.count > 0)
    if (activeRecords.length === 0) {
        return baseCaption
    }

    const lines = activeRecords.map((r) => {
        const userList = r.users.join(', ')
        return `${r.emoji} (${r.count}) — ${userList}`
    })

    const full = `${baseCaption}\n\n${lines.join('\n')}`
    if (full.length <= 1024) {
        return full
    }

    const truncatedLines = activeRecords.map((r) => `${r.emoji} (${r.count})`)
    const shortFull = `${baseCaption}\n\n${truncatedLines.join('\n')}`
    if (shortFull.length <= 1024) {
        return shortFull
    }

    return baseCaption
}

export async function handleReactionCallback(ctx: CustomContext): Promise<void> {
    const data = ctx.callbackQuery?.data
    if (!data || !data.startsWith('react:')) return

    const emoji = data.replace('react:', '')
    const chatId = ctx.chat?.id
    const messageId = ctx.callbackQuery.message?.message_id
    const userId = ctx.from?.id

    if (!chatId || !messageId || !userId) return

    const userName = ctx.from.username
        ? `@${ctx.from.username}`
        : [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'пользователь'

    const { added } = await toggleUserReaction(chatId, messageId, userId, userName, emoji)

    try {
        await ctx.answerCallbackQuery({
            text: added ? `${emoji} +1` : `${emoji} -1`
        })
    } catch {}

    const records = await getMessageReactions(chatId, messageId)
    const baseCaption = await getMediaMessage(chatId, messageId)

    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup'
    let reactionButtons = '👍,❤️,🔥,😂,🤡,💩,🤮'

    if (isGroup) {
        const s = await getChatSettings(chatId)
        reactionButtons = s.reaction_buttons
    } else {
        const s = await getUserSettings(userId)
        reactionButtons = s.reaction_buttons
    }

    const counts = new Map<string, number>()
    for (const r of records) {
        counts.set(r.emoji, r.count)
    }

    const keyboard = buildReactionKeyboard(reactionButtons, counts)
    const newCaption = baseCaption ? formatReactionsCaption(baseCaption, records) : undefined

    try {
        if (newCaption) {
            await ctx.editMessageCaption({
                caption: newCaption,
                parse_mode: 'HTML',
                reply_markup: keyboard
            })
        } else if (keyboard) {
            await ctx.editMessageReplyMarkup({
                reply_markup: keyboard
            })
        }
    } catch {}
}
