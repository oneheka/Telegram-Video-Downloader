import { getChatLanguage, getUserLanguage } from "@/db";
import type { Context, MiddlewareFn } from "grammy";
import { CONFIG } from "@/config";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import kk from "@/locales/kk.json";
import ky from "@/locales/ky.json";
import zh from "@/locales/zh.json";
import ar from "@/locales/ar.json";
import ko from "@/locales/ko.json";
import ru from "@/locales/ru.json";
import en from "@/locales/en.json";

export type SupportedLang = 'en' | 'ru' | 'ko' | 'ar' | 'zh' | 'ky' | 'kk' | 'de' | 'fr'

const locales: Record<SupportedLang, Record<string, string>> = {
    en,
    ru,
    ko,
    ar,
    zh,
    ky,
    kk,
    de,
    fr
}

export interface CustomContextFlavor {
    lang: SupportedLang
    t: (key: string) => string
}

export type CustomContext = Context & CustomContextFlavor

export function resolveLanguageCode(rawCode?: string): SupportedLang | null {
    if (!rawCode) return null
    const code = rawCode.toLowerCase()
    if (code.startsWith('ru')) return 'ru'
    if (code.startsWith('ko')) return 'ko'
    if (code.startsWith('ar')) return 'ar'
    if (code.startsWith('zh')) return 'zh'
    if (code.startsWith('ky')) return 'ky'
    if (code.startsWith('kk')) return 'kk'
    if (code.startsWith('de')) return 'de'
    if (code.startsWith('fr')) return 'fr'
    if (code.startsWith('en')) return 'en'
    return null
}

export const i18nMiddleware: MiddlewareFn<CustomContext> = async (ctx, next) => {
    let lang: SupportedLang | null = null

    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
        const dbChatLang = await getChatLanguage(ctx.chat.id)
        if (dbChatLang) {
            lang = resolveLanguageCode(dbChatLang)
        }
    }

    if (!lang && ctx.from) {
        const dbUserLang = await getUserLanguage(ctx.from.id)
        if (dbUserLang) {
            lang = resolveLanguageCode(dbUserLang)
        }
    }

    if (!lang && ctx.from?.language_code) {
        lang = resolveLanguageCode(ctx.from.language_code)
    }

    const finalLang: SupportedLang = lang || (CONFIG.DEFAULT_LANGUAGE as SupportedLang) || 'en'

    ctx.lang = finalLang
    ctx.t = (key: string): string => {
        const dict = locales[finalLang] || locales.en
        return dict[key] || locales.en[key] || key
    }

    await next()
}
