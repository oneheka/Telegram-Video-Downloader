import { toggleUserReaction, getMessageReactions, saveMediaMessage, getMediaMessage, updateUserSettings, getUserSettings, updateChatSettings, getChatSettings } from "@/db";
import { buildReactionKeyboard, formatReactionsCaption, parseAndValidateCustomEmojis, ALL_REACTIONS } from "@/handlers/reactions";
import { getReactionsKeyboard } from "@/handlers/language";
import { describe, it as test } from "node:test";
import assert from "node:assert/strict";

describe('Reactions Helper Tests', () => {
    test('Contains 8 reactions in ALL_REACTIONS pool', () => {
        assert.equal(ALL_REACTIONS.length, 8)
        assert.ok(ALL_REACTIONS.includes('👍'))
        assert.ok(ALL_REACTIONS.includes('💩'))
        assert.ok(ALL_REACTIONS.includes('🤮'))
        assert.ok(ALL_REACTIONS.includes('🤡'))
    })

    test('buildReactionKeyboard builds keyboard with 5 buttons per row', () => {
        const counts = new Map<string, number>([
            ['👍', 3],
            ['🤡', 1]
        ])
        const kb = buildReactionKeyboard('👍,❤️,🔥,😂,🤡,💩,🤮', counts)
        assert.notEqual(kb, undefined)
        const json = kb!.inline_keyboard
        assert.equal(json.length, 2)
        assert.equal(json[0].length, 5)
        assert.equal(json[1].length, 2)
        assert.equal(json[0][0].text, '👍 3')
        assert.equal(json[0][1].text, '❤️')
        assert.equal(json[0][4].text, '🤡 1')
        assert.equal(json[1][0].text, '💩')
        assert.equal(json[1][1].text, '🤮')
    })

    test('buildReactionKeyboard returns undefined when buttons string is empty', () => {
        const counts = new Map<string, number>()
        const kb = buildReactionKeyboard('', counts)
        assert.equal(kb, undefined)
    })

    test('getReactionsKeyboard formats buttons with style success for selected items', () => {
        const selected = ['👍', '🔥']
        const kb = getReactionsKeyboard(selected, (k) => k)
        const json = kb.inline_keyboard

        assert.equal(json[0][0].text, '👍')
        assert.equal((json[0][0] as any).style, 'success')

        assert.equal(json[0][1].text, '❤️')
        assert.equal((json[0][1] as any).style, undefined)

        assert.equal(json[0][2].text, '🔥')
        assert.equal((json[0][2] as any).style, 'success')
    })

    test('formatReactionsCaption formats active reactions correctly', () => {
        const base = '@bot | <a href="https://example.com">Open</a>'
        const records = [
            { emoji: '👍', users: ['@yacord', '@oneheka'], count: 2 },
            { emoji: '🤡', users: ['@alex'], count: 1 }
        ]
        const formatted = formatReactionsCaption(base, records)
        assert.equal(formatted, '@bot | <a href="https://example.com">Open</a>\n\n👍 (2) — @yacord, @oneheka\n🤡 (1) — @alex')
    })

    test('formatReactionsCaption returns base caption when no reactions', () => {
        const base = '@bot | <a href="https://example.com">Open</a>'
        const formatted = formatReactionsCaption(base, [])
        assert.equal(formatted, base)
    })
})

describe('Custom Emojis Validation Tests', () => {
    test('Validates space-separated and consecutive emojis correctly', () => {
        const res1 = parseAndValidateCustomEmojis('👍 🔥 🤡 💩 🚀 ⚡️ 🍕', 20)
        assert.equal(res1.valid, true)
        assert.equal(res1.emojis.length, 7)
        assert.deepEqual(res1.emojis, ['👍', '🔥', '🤡', '💩', '🚀', '⚡️', '🍕'])

        const res2 = parseAndValidateCustomEmojis('👍🔥🤡', 20)
        assert.equal(res2.valid, true)
        assert.deepEqual(res2.emojis, ['👍', '🔥', '🤡'])

        const res3 = parseAndValidateCustomEmojis('👍, 🔥, 🤡', 20)
        assert.equal(res3.valid, true)
        assert.deepEqual(res3.emojis, ['👍', '🔥', '🤡'])
    })

    test('Validates complex and special emojis (ZWJ, skin tone, finger heart)', () => {
        const res = parseAndValidateCustomEmojis('❤️‍🔥 👍🏽 👨‍👩‍👧 🫪', 20)
        assert.equal(res.valid, true)
        assert.equal(res.emojis.length, 4)
    })

    test('Rejects input containing letters, words, links, or numbers', () => {
        const res1 = parseAndValidateCustomEmojis('👍 привет 🔥', 20)
        assert.equal(res1.valid, false)
        assert.equal(res1.error, 'invalid_char')

        const res2 = parseAndValidateCustomEmojis('https://example.com', 20)
        assert.equal(res2.valid, false)
        assert.equal(res2.error, 'invalid_char')

        const res3 = parseAndValidateCustomEmojis('12345', 20)
        assert.equal(res3.valid, false)
        assert.equal(res3.error, 'invalid_char')
    })

    test('Rejects empty or whitespace-only input', () => {
        const res1 = parseAndValidateCustomEmojis('   ', 20)
        assert.equal(res1.valid, false)
        assert.equal(res1.error, 'empty')

        const res2 = parseAndValidateCustomEmojis(', ; |', 20)
        assert.equal(res2.valid, false)
        assert.equal(res2.error, 'empty')
    })

    test('Enforces maximum count limit of 20 emojis', () => {
        const twentyOne = '1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 👍 👎 ❤️ 🔥 😂 🤡 💩 🤮 😱 🤯 ⚡️'
        const res = parseAndValidateCustomEmojis(twentyOne, 20)
        assert.equal(res.valid, false)
        assert.equal(res.error, 'too_many')

        const twenty = '1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 👍 👎 ❤️ 🔥 😂 🤡 💩 🤮 😱 🤯'
        const resValid = parseAndValidateCustomEmojis(twenty, 20)
        assert.equal(resValid.valid, true)
        assert.equal(resValid.emojis.length, 20)
    })
})

describe('Reactions DB Operations Test', () => {
    test('Saves and retrieves base media message caption', async () => {
        await saveMediaMessage(999, 1001, 'Base Caption 123')
        const caption = await getMediaMessage(999, 1001)
        assert.equal(caption, 'Base Caption 123')
    })

    test('Toggles user reaction on and off', async () => {
        const res1 = await toggleUserReaction(999, 1001, 42, '@yacord', '🤡')
        assert.equal(res1.added, true)

        let records = await getMessageReactions(999, 1001)
        assert.equal(records.length, 1)
        assert.equal(records[0].emoji, '🤡')
        assert.equal(records[0].count, 1)
        assert.deepEqual(records[0].users, ['@yacord'])

        const res2 = await toggleUserReaction(999, 1001, 43, '@oneheka', '🤡')
        assert.equal(res2.added, true)

        records = await getMessageReactions(999, 1001)
        assert.equal(records[0].count, 2)

        const res3 = await toggleUserReaction(999, 1001, 42, '@yacord', '🤡')
        assert.equal(res3.added, false)

        records = await getMessageReactions(999, 1001)
        assert.equal(records[0].count, 1)
        assert.deepEqual(records[0].users, ['@oneheka'])
    })

    test('Default user settings have reactions disabled and empty', async () => {
        const u = await getUserSettings(999999)
        assert.equal(u.enable_reactions, false)
        assert.equal(u.reaction_buttons, '')
    })

    test('Persists empty reaction buttons without resetting to default', async () => {
        await updateUserSettings(77777, {
            reaction_buttons: ''
        })
        const u = await getUserSettings(77777)
        assert.equal(u.reaction_buttons, '')

        await updateChatSettings(88888, {
            reaction_buttons: ''
        })
        const c = await getChatSettings(88888)
        assert.equal(c.reaction_buttons, '')
    })
})
