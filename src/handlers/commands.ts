import { getMainSettingsKeyboard, getLanguageKeyboard } from "@/handlers/language";
import type { CustomContext } from "@/i18n";

export async function handleStart(ctx: CustomContext): Promise<void> {
    const text = `${ctx.t('welcome')}\n\n${ctx.t('settings_menu')}`
    const keyboard = await getMainSettingsKeyboard(ctx)

    await ctx.reply(text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    })
}

export async function handleHelp(ctx: CustomContext): Promise<void> {
    await handleStart(ctx)
}

export async function handleLangCommand(ctx: CustomContext): Promise<void> {
    const text = `${ctx.t('lang_select')}\n\n${ctx.t('active_lang')}`
    const keyboard = getLanguageKeyboard(ctx.lang, ctx.t)

    await ctx.reply(text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    })
}
