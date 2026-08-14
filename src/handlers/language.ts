import { getChatSettings, getUserSettings, updateChatSettings, updateUserSettings, setChatLanguage, setUserLanguage } from "@/db";
import { ALL_REACTIONS } from "@/handlers/reactions";
import type { CustomContext, SupportedLang } from "@/i18n";
import { InlineKeyboard } from "grammy";

export async function getMainSettingsKeyboard(ctx: CustomContext): Promise<InlineKeyboard> {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')

    let autoDelete = true
    let showSender = true
    let showDescription = true
    let checkDuplicates = true
    let enableReactions = true

    if (isGroup && ctx.chat) {
        const s = await getChatSettings(ctx.chat.id)
        autoDelete = s.auto_delete_link
        showSender = s.show_sender
        showDescription = s.show_description
        checkDuplicates = s.check_duplicates
        enableReactions = s.enable_reactions
    } else if (ctx.from) {
        const s = await getUserSettings(ctx.from.id)
        autoDelete = s.auto_delete_link
        showDescription = s.show_description
        enableReactions = s.enable_reactions
    }

    const kb = new InlineKeyboard()
        .text(ctx.t('btn_language'), 'menu:lang')
        .row()
        .text(
            `${ctx.t('btn_auto_delete')} ${autoDelete ? ctx.t('status_on') : ctx.t('status_off')}`,
            'toggle:auto_delete'
        )
        .row()
        .text(
            `${ctx.t('btn_show_description')} ${showDescription ? ctx.t('status_on') : ctx.t('status_off')}`,
            'toggle:show_description'
        )
        .row()
        .text(
            `${ctx.t('btn_enable_reactions')} ${enableReactions ? ctx.t('status_on') : ctx.t('status_off')}`,
            'toggle:enable_reactions'
        )

    if (enableReactions) {
        kb.row().text(ctx.t('btn_customize_reactions'), 'menu:reactions')
    }

    if (isGroup) {
        kb.row().text(
            `${ctx.t('btn_show_sender')} ${showSender ? ctx.t('status_on') : ctx.t('status_off')}`,
            'toggle:show_sender'
        )
        .row().text(
            `${ctx.t('btn_check_duplicates')} ${checkDuplicates ? ctx.t('status_on') : ctx.t('status_off')}`,
            'toggle:check_duplicates'
        )
    }

    return kb
}

export function getLanguageKeyboard(currentLang: SupportedLang, t: (key: string) => string): InlineKeyboard {
    return new InlineKeyboard()
        .text(currentLang === 'en' ? '✅ 🇬🇧 English' : '🇬🇧 English', 'set_lang:en')
        .text(currentLang === 'ru' ? '✅ 🇷🇺 Русский' : '🇷🇺 Русский', 'set_lang:ru')
        .text(currentLang === 'ko' ? '✅ 🇰🇷 한국어' : '🇰🇷 한국어', 'set_lang:ko')
        .row()
        .text(currentLang === 'ar' ? '✅ 🇦🇪 العربية' : '🇦🇪 العربية', 'set_lang:ar')
        .text(currentLang === 'zh' ? '✅ 🇨🇳 中文' : '🇨🇳 中文', 'set_lang:zh')
        .text(currentLang === 'ky' ? '✅ 🇰🇬 Кыргызча' : '🇰🇬 Кыргызча', 'set_lang:ky')
        .row()
        .text(currentLang === 'kk' ? '✅ 🇰🇿 Қазақша' : '🇰🇿 Қазақша', 'set_lang:kk')
        .text(currentLang === 'de' ? '✅ 🇩🇪 Deutsch' : '🇩🇪 Deutsch', 'set_lang:de')
        .text(currentLang === 'fr' ? '✅ 🇫🇷 Français' : '🇫🇷 Français', 'set_lang:fr')
        .row()
        .text(t('btn_back'), 'menu:main')
}

export function getReactionsKeyboard(selectedEmojis: string[], t: (key: string) => string): InlineKeyboard {
    const kb = new InlineKeyboard()
    const set = new Set(selectedEmojis)

    let col = 0
    for (const emoji of ALL_REACTIONS) {
        const isSelected = set.has(emoji)
        const label = `${isSelected ? '✅' : '⚪️'} ${emoji}`
        kb.text(label, `toggle_emoji:${emoji}`)
        col++
        if (col >= 4) {
            kb.row()
            col = 0
        }
    }

    if (col !== 0) {
        kb.row()
    }

    kb.text(t('btn_back'), 'menu:main')
    return kb
}

export async function handleLanguageCallback(ctx: CustomContext): Promise<void> {
    const callbackData = ctx.callbackQuery?.data
    if (!callbackData) return

    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')

    const safeAnswer = async (options?: { text?: string; show_alert?: boolean }) => {
        try {
            await ctx.answerCallbackQuery(options)
        } catch {}
    }

    const checkAdmin = async (): Promise<boolean> => {
        if (!isGroup) return true
        try {
            const member = await ctx.getChatMember(ctx.from!.id)
            const isAdmin = ['administrator', 'creator'].includes(member.status)
            if (!isAdmin) {
                await safeAnswer({
                    text: ctx.t('error_admin_only'),
                    show_alert: true
                })
                return false
            }
        } catch {}
        return true
    }

    if (callbackData === 'menu:main') {
        await safeAnswer()
        const text = `${ctx.t('welcome')}\n\n${ctx.t('settings_menu')}`
        const keyboard = await getMainSettingsKeyboard(ctx)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData === 'menu:lang') {
        await safeAnswer()
        const text = `${ctx.t('lang_select')}\n\n${ctx.t('active_lang')}`
        const keyboard = getLanguageKeyboard(ctx.lang, ctx.t)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData === 'menu:reactions') {
        await safeAnswer()
        let reactionButtons = '👍,❤️,🔥,😂,🤡,💩,🤮'
        if (isGroup && ctx.chat) {
            const s = await getChatSettings(ctx.chat.id)
            reactionButtons = s.reaction_buttons
        } else if (ctx.from) {
            const s = await getUserSettings(ctx.from.id)
            reactionButtons = s.reaction_buttons
        }

        const selected = reactionButtons.split(',').map((e) => e.trim()).filter(Boolean)
        const text = ctx.t('reactions_menu_title')
        const keyboard = getReactionsKeyboard(selected, ctx.t)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData.startsWith('toggle_emoji:')) {
        if (!(await checkAdmin())) return

        const targetEmoji = callbackData.replace('toggle_emoji:', '')
        let reactionButtons = '👍,❤️,🔥,😂,🤡,💩,🤮'
        if (isGroup && ctx.chat) {
            const s = await getChatSettings(ctx.chat.id)
            reactionButtons = s.reaction_buttons
        } else if (ctx.from) {
            const s = await getUserSettings(ctx.from.id)
            reactionButtons = s.reaction_buttons
        }

        let selected = reactionButtons.split(',').map((e) => e.trim()).filter(Boolean)
        if (selected.includes(targetEmoji)) {
            selected = selected.filter((e) => e !== targetEmoji)
        } else {
            selected.push(targetEmoji)
        }

        const newButtonsString = selected.join(',')

        if (isGroup && ctx.chat) {
            await updateChatSettings(ctx.chat.id, {
                reaction_buttons: newButtonsString
            })
        } else if (ctx.from) {
            await updateUserSettings(ctx.from.id, {
                reaction_buttons: newButtonsString
            })
        }

        await safeAnswer()
        const text = ctx.t('reactions_menu_title')
        const keyboard = getReactionsKeyboard(selected, ctx.t)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData.startsWith('set_lang:')) {
        if (!(await checkAdmin())) return

        const targetLang = callbackData.split(':')[1] as SupportedLang
        if (!['en', 'ru', 'ko', 'ar', 'zh', 'ky', 'kk', 'de', 'fr'].includes(targetLang)) return

        if (isGroup && ctx.chat) {
            await setChatLanguage(ctx.chat.id, targetLang)
        } else if (ctx.from) {
            await setUserLanguage(ctx.from.id, targetLang)
        }

        ctx.lang = targetLang

        await safeAnswer({
            text: ctx.t('lang_changed')
        })

        const text = `${ctx.t('lang_select')}\n\n${ctx.t('active_lang')}`
        const keyboard = getLanguageKeyboard(targetLang, ctx.t)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData === 'toggle:enable_reactions') {
        if (!(await checkAdmin())) return

        if (isGroup && ctx.chat) {
            const s = await getChatSettings(ctx.chat.id)
            await updateChatSettings(ctx.chat.id, {
                enable_reactions: !s.enable_reactions
            })
        } else if (ctx.from) {
            const s = await getUserSettings(ctx.from.id)
            await updateUserSettings(ctx.from.id, {
                enable_reactions: !s.enable_reactions
            })
        }

        await safeAnswer()
        const text = `${ctx.t('welcome')}\n\n${ctx.t('settings_menu')}`
        const keyboard = await getMainSettingsKeyboard(ctx)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData === 'toggle:auto_delete') {
        if (!(await checkAdmin())) return

        if (isGroup && ctx.chat) {
            const s = await getChatSettings(ctx.chat.id)
            await updateChatSettings(ctx.chat.id, {
                auto_delete_link: !s.auto_delete_link
            })
        } else if (ctx.from) {
            const s = await getUserSettings(ctx.from.id)
            await updateUserSettings(ctx.from.id, {
                auto_delete_link: !s.auto_delete_link
            })
        }

        await safeAnswer()
        const text = `${ctx.t('welcome')}\n\n${ctx.t('settings_menu')}`
        const keyboard = await getMainSettingsKeyboard(ctx)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData === 'toggle:show_description') {
        if (!(await checkAdmin())) return

        if (isGroup && ctx.chat) {
            const s = await getChatSettings(ctx.chat.id)
            await updateChatSettings(ctx.chat.id, {
                show_description: !s.show_description
            })
        } else if (ctx.from) {
            const s = await getUserSettings(ctx.from.id)
            await updateUserSettings(ctx.from.id, {
                show_description: !s.show_description
            })
        }

        await safeAnswer()
        const text = `${ctx.t('welcome')}\n\n${ctx.t('settings_menu')}`
        const keyboard = await getMainSettingsKeyboard(ctx)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData === 'toggle:show_sender') {
        if (!(await checkAdmin())) return

        if (isGroup && ctx.chat) {
            const s = await getChatSettings(ctx.chat.id)
            await updateChatSettings(ctx.chat.id, {
                show_sender: !s.show_sender
            })
        }

        await safeAnswer()
        const text = `${ctx.t('welcome')}\n\n${ctx.t('settings_menu')}`
        const keyboard = await getMainSettingsKeyboard(ctx)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }

    if (callbackData === 'toggle:check_duplicates') {
        if (!(await checkAdmin())) return

        if (isGroup && ctx.chat) {
            const s = await getChatSettings(ctx.chat.id)
            await updateChatSettings(ctx.chat.id, {
                check_duplicates: !s.check_duplicates
            })
        }

        await safeAnswer()
        const text = `${ctx.t('welcome')}\n\n${ctx.t('settings_menu')}`
        const keyboard = await getMainSettingsKeyboard(ctx)
        try {
            await ctx.editMessageText(text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            })
        } catch {}
        return
    }
}
