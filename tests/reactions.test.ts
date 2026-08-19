import { buildReactionKeyboard, formatReactionsCaption, ALL_REACTIONS } from "@/handlers/reactions";
import { toggleUserReaction, getMessageReactions, saveMediaMessage, getMediaMessage, updateUserSettings, getUserSettings, updateChatSettings, getChatSettings } from "@/db";
import { describe, it as test } from "node:test";
import assert from "node:assert/strict";

describe('Reactions Helper Tests', () => {
    test('Contains 25 reactions in ALL_REACTIONS pool', () => {
        assert.equal(ALL_REACTIONS.length, 25)
        assert.ok(ALL_REACTIONS.includes('👍'))
        assert.ok(ALL_REACTIONS.includes('💩'))
        assert.ok(ALL_REACTIONS.includes('🤮'))
        assert.ok(ALL_REACTIONS.includes('🤡'))
        assert.ok(ALL_REACTIONS.includes('🫪'))
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
