import { getChatSettings, getUserSettings, updateChatSettings, updateUserSettings, setChatLanguage, setUserLanguage } from "@/db";
import type { CustomContext, SupportedLang } from "@/i18n";
import { InlineKeyboard } from "grammy";

export async function getMainSettingsKeyboard(ctx: CustomContext): Promise<InlineKeyboard> {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')

    let autoDelete = true
    let showSender = true
    let showDescription = true
    let checkDuplicates = true

    if (isGroup && ctx.chat) {
        const s = await getChatSettings(ctx.chat.id)
        autoDelete = s.auto_delete_link
        showSender = s.show_sender
        showDescription = s.show_description
        checkDuplicates = s.check_duplicates
    } else if (ctx.from) {
        const s = await getUserSettings(ctx.from.id)
        autoDelete = s.auto_delete_link
        showDescription = s.show_description
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
        .text(currentLang === 'ar' ? '✅ 🇸🇦 العربية' : '🇸🇦 العربية', 'set_lang:ar')
        .text(currentLang === 'zh' ? '✅ 🇨🇳 中文' : '🇨🇳 中文', 'set_lang:zh')
        .text(currentLang === 'ky' ? '✅ 🇰🇬 Кыргызча' : '🇰🇬 Кыргызча', 'set_lang:ky')
        .row()
        .text(currentLang === 'kk' ? '✅ 🇰🇿 Қазақша' : '🇰🇿 Қазақша', 'set_lang:kk')
        .text(currentLang === 'de' ? '✅ 🇩🇪 Deutsch' : '🇩🇪 Deutsch', 'set_lang:de')
        .text(currentLang === 'fr' ? '✅ 🇫🇷 Français' : '🇫🇷 Français', 'set_lang:fr')
        .row()
        .text(t('btn_back'), 'menu:main')
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
