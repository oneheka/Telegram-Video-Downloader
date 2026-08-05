import { extractSupportedUrl } from "@/downloader";
import { describe, it as test } from "node:test";
import { resolveLanguageCode } from "@/i18n";
import assert from "node:assert/strict";

describe('Downloader Link Extraction Test', () => {
    test('Detects Instagram Reel link', () => {
        const text = 'Look at this video https://www.instagram.com/reel/C3x9zY1oABc/?igsh=MWF2'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'instagram')
        assert.equal(res?.url, 'https://www.instagram.com/reel/C3x9zY1oABc/?igsh=MWF2')
    })

    test('Detects TikTok link', () => {
        const text = 'Check this https://vm.tiktok.com/ZM8xQy123/'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'tiktok')
        assert.equal(res?.url, 'https://vm.tiktok.com/ZM8xQy123/')
    })

    test('Detects YouTube Shorts link', () => {
        const text = 'Hey watch https://youtube.com/shorts/dQw4w9WgXcQ?feature=share'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'youtube')
        assert.equal(res?.url, 'https://youtube.com/shorts/dQw4w9WgXcQ?feature=share')
    })

    test('Ignores full YouTube watch video link', () => {
        const text = 'Standard video https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        const res = extractSupportedUrl(text)
        assert.equal(res, null)
    })

    test('Detects Twitter/X status link', () => {
        const text = 'Check this tweet https://x.com/user/status/1234567890?s=20'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'twitter')
        assert.equal(res?.url, 'https://x.com/user/status/1234567890?s=20')
    })

    test('Detects VK Clip link', () => {
        const text = 'Watch clip https://vk.com/clip-12345_67890'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'vk')
        assert.equal(res?.url, 'https://vk.com/clip-12345_67890')
    })

    test('Detects Reddit video link', () => {
        const text = 'Check reddit https://www.reddit.com/r/funny/comments/123abc/some_title/'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'reddit')
        assert.equal(res?.url, 'https://www.reddit.com/r/funny/comments/123abc/some_title/')
    })

    test('Detects Pinterest pin link', () => {
        const text = 'Pin video https://pin.it/abc1234'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'pinterest')
        assert.equal(res?.url, 'https://pin.it/abc1234')
    })

    test('Ignores non-video link', () => {
        const text = 'Hello world https://google.com'
        const res = extractSupportedUrl(text)
        assert.equal(res, null)
    })
})

describe('i18n Language Resolution Test', () => {
    test('Resolves Russian language codes', () => {
        assert.equal(resolveLanguageCode('ru'), 'ru')
        assert.equal(resolveLanguageCode('ru-RU'), 'ru')
    })

    test('Resolves Korean language codes', () => {
        assert.equal(resolveLanguageCode('ko'), 'ko')
        assert.equal(resolveLanguageCode('ko-KR'), 'ko')
    })

    test('Resolves English language codes', () => {
        assert.equal(resolveLanguageCode('en'), 'en')
        assert.equal(resolveLanguageCode('en-US'), 'en')
    })

    test('Resolves Arabic language codes', () => {
        assert.equal(resolveLanguageCode('ar'), 'ar')
        assert.equal(resolveLanguageCode('ar-SA'), 'ar')
    })

    test('Resolves Chinese language codes', () => {
        assert.equal(resolveLanguageCode('zh'), 'zh')
        assert.equal(resolveLanguageCode('zh-CN'), 'zh')
    })

    test('Resolves Kyrgyz language codes', () => {
        assert.equal(resolveLanguageCode('ky'), 'ky')
        assert.equal(resolveLanguageCode('ky-KG'), 'ky')
    })

    test('Resolves Kazakh language codes', () => {
        assert.equal(resolveLanguageCode('kk'), 'kk')
        assert.equal(resolveLanguageCode('kk-KZ'), 'kk')
    })

    test('Resolves German language codes', () => {
        assert.equal(resolveLanguageCode('de'), 'de')
        assert.equal(resolveLanguageCode('de-DE'), 'de')
    })

    test('Resolves French language codes', () => {
        assert.equal(resolveLanguageCode('fr'), 'fr')
        assert.equal(resolveLanguageCode('fr-FR'), 'fr')
    })

    test('Returns null for unsupported languages', () => {
        assert.equal(resolveLanguageCode('es'), null)
        assert.equal(resolveLanguageCode('it'), null)
    })
})