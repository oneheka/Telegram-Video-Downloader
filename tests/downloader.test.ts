import { extractSupportedUrl } from "@/downloader";
import { describe, it as test } from "node:test";
import { chunkArray } from "@/handlers/downloader";
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

    test('Detects TikTok photo post link', () => {
        const text = 'Look at this photo https://www.tiktok.com/@arqsvild/photo/7670305590068923656?_r=1&_t=ZS-98d1AbjVTcq'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'tiktok')
        assert.equal(res?.url, 'https://www.tiktok.com/@arqsvild/photo/7670305590068923656?_r=1&_t=ZS-98d1AbjVTcq')
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

    test('Detects Instagram photo post and share links', () => {
        const text = 'Look at post https://www.instagram.com/p/C3x9zY1oABc/'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'instagram')
        assert.equal(res?.url, 'https://www.instagram.com/p/C3x9zY1oABc/')
    })

    test('Detects Twitter/X status link', () => {
        const text = 'Check this tweet https://x.com/user/status/1234567890?s=20'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'twitter')
        assert.equal(res?.url, 'https://x.com/user/status/1234567890?s=20')
    })

    test('Detects VK Clip and Wall links', () => {
        const text = 'Watch clip https://vk.com/wall-12345_67890'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'vk')
        assert.equal(res?.url, 'https://vk.com/wall-12345_67890')
    })

    test('Detects Reddit image link', () => {
        const text = 'Check reddit https://i.redd.it/abc123456'
        const res = extractSupportedUrl(text)
        assert.notEqual(res, null)
        assert.equal(res?.platform, 'reddit')
        assert.equal(res?.url, 'https://i.redd.it/abc123456')
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

describe('Chunk Array Helper Test', () => {
    test('Splits array of 15 elements into chunks of 10', () => {
        const items = Array.from({ length: 15 }, (_, i) => `photo_${i + 1}.jpg`)
        const chunks = chunkArray(items, 10)
        assert.equal(chunks.length, 2)
        assert.equal(chunks[0].length, 10)
        assert.equal(chunks[1].length, 5)
    })

    test('Returns single chunk for 5 elements', () => {
        const items = Array.from({ length: 5 }, (_, i) => `photo_${i + 1}.jpg`)
        const chunks = chunkArray(items, 10)
        assert.equal(chunks.length, 1)
        assert.equal(chunks[0].length, 5)
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