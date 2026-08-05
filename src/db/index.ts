import { users, chats, mediaHistory } from "@/db/schema";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, and, gte, lt } from "drizzle-orm";
import type { Sql } from "postgres";
import { CONFIG } from "@/config";
import postgres from "postgres";

export interface ChatSettings {
    language_code: string
    auto_delete_link: boolean
    show_sender: boolean
    show_description: boolean
    check_duplicates: boolean
}

export interface UserSettings {
    language_code: string
    auto_delete_link: boolean
    show_description: boolean
}

export interface DuplicateResult {
    isDuplicate: boolean
    firstAuthor: string
    firstMessageId?: number
}

let queryClient: Sql | null = null
let db: PostgresJsDatabase<typeof import("@/db/schema")> | null = null

const memoryUserSettings = new Map<number, UserSettings>()
const memoryChatSettings = new Map<number, ChatSettings>()
const memoryMediaHistory: Array<{ chatId: number; userId: number; authorName: string; mediaKey: string; messageId?: number; timestamp: number }> = []

export async function initDb(): Promise<boolean> {
    try {
        queryClient = postgres(CONFIG.DATABASE_URL, {
            max: 10,
            idle_timeout: 30,
            connect_timeout: 5,
            onnotice: () => {}
        })

        db = drizzle(queryClient, {
            schema: {
                users,
                chats,
                mediaHistory
            }
        })

        await queryClient`
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT PRIMARY KEY,
                language_code VARCHAR(10) NOT NULL DEFAULT 'en',
                auto_delete_link BOOLEAN NOT NULL DEFAULT TRUE,
                show_description BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `

        await queryClient`
            CREATE TABLE IF NOT EXISTS chats (
                id BIGINT PRIMARY KEY,
                language_code VARCHAR(10) NOT NULL DEFAULT 'en',
                auto_delete_link BOOLEAN NOT NULL DEFAULT TRUE,
                show_sender BOOLEAN NOT NULL DEFAULT TRUE,
                show_description BOOLEAN NOT NULL DEFAULT TRUE,
                check_duplicates BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `

        await queryClient`
            CREATE TABLE IF NOT EXISTS media_history (
                id BIGSERIAL PRIMARY KEY,
                chat_id BIGINT NOT NULL,
                user_id BIGINT NOT NULL,
                author_name VARCHAR(255) NOT NULL DEFAULT '',
                media_key VARCHAR(255) NOT NULL,
                message_id BIGINT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `

        await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_delete_link BOOLEAN NOT NULL DEFAULT TRUE;`
        await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS show_description BOOLEAN NOT NULL DEFAULT TRUE;`
        await queryClient`ALTER TABLE chats ADD COLUMN IF NOT EXISTS auto_delete_link BOOLEAN NOT NULL DEFAULT TRUE;`
        await queryClient`ALTER TABLE chats ADD COLUMN IF NOT EXISTS show_sender BOOLEAN NOT NULL DEFAULT TRUE;`
        await queryClient`ALTER TABLE chats ADD COLUMN IF NOT EXISTS show_description BOOLEAN NOT NULL DEFAULT TRUE;`
        await queryClient`ALTER TABLE chats ADD COLUMN IF NOT EXISTS check_duplicates BOOLEAN NOT NULL DEFAULT TRUE;`
        await queryClient`ALTER TABLE media_history ADD COLUMN IF NOT EXISTS author_name VARCHAR(255) NOT NULL DEFAULT '';`
        await queryClient`ALTER TABLE media_history ADD COLUMN IF NOT EXISTS message_id BIGINT;`

        await queryClient`CREATE INDEX IF NOT EXISTS idx_media_history_chat_key ON media_history(chat_id, media_key);`
        await queryClient`CREATE INDEX IF NOT EXISTS idx_media_history_created ON media_history(created_at);`

        setInterval(() => {
            cleanupOldMediaHistory().catch(() => {})
        }, 60 * 60 * 1000)

        console.log('✅ Successfully connected to PostgreSQL via Drizzle ORM.')
        return true
    } catch (error) {
        console.warn('⚠️ Could not connect to PostgreSQL database. Falling back to in-memory storage.')
        console.warn('   Details:', (error as Error).message)
        queryClient = null
        db = null
        return false
    }
}

export async function getUserSettings(userId: number): Promise<UserSettings> {
    if (db) {
        try {
            const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
            if (rows.length > 0) {
                return {
                    language_code: rows[0].languageCode,
                    auto_delete_link: rows[0].autoDeleteLink,
                    show_description: rows[0].showDescription
                }
            }
        } catch (error) {
            console.error('DB Error in getUserSettings:', error)
        }
    }

    return memoryUserSettings.get(userId) || {
        language_code: CONFIG.DEFAULT_LANGUAGE,
        auto_delete_link: true,
        show_description: true
    }
}

export async function updateUserSettings(userId: number, update: Partial<UserSettings>): Promise<UserSettings> {
    const current = await getUserSettings(userId)
    const updated: UserSettings = {
        ...current,
        ...update
    }
    memoryUserSettings.set(userId, updated)

    if (db) {
        try {
            await db.insert(users).values({
                id: userId,
                languageCode: updated.language_code,
                autoDeleteLink: updated.auto_delete_link,
                showDescription: updated.show_description
            }).onConflictDoUpdate({
                target: users.id,
                set: {
                    languageCode: updated.language_code,
                    autoDeleteLink: updated.auto_delete_link,
                    showDescription: updated.show_description,
                    updatedAt: new Date()
                }
            })
        } catch (error) {
            console.error('DB Error in updateUserSettings:', error)
        }
    }

    return updated
}

export async function getChatSettings(chatId: number): Promise<ChatSettings> {
    if (db) {
        try {
            const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1)
            if (rows.length > 0) {
                return {
                    language_code: rows[0].languageCode,
                    auto_delete_link: rows[0].autoDeleteLink,
                    show_sender: rows[0].showSender,
                    show_description: rows[0].showDescription,
                    check_duplicates: rows[0].checkDuplicates
                }
            }
        } catch (error) {
            console.error('DB Error in getChatSettings:', error)
        }
    }

    return memoryChatSettings.get(chatId) || {
        language_code: CONFIG.DEFAULT_LANGUAGE,
        auto_delete_link: true,
        show_sender: true,
        show_description: true,
        check_duplicates: true
    }
}

export async function updateChatSettings(chatId: number, update: Partial<ChatSettings>): Promise<ChatSettings> {
    const current = await getChatSettings(chatId)
    const updated: ChatSettings = {
        ...current,
        ...update
    }
    memoryChatSettings.set(chatId, updated)

    if (db) {
        try {
            await db.insert(chats).values({
                id: chatId,
                languageCode: updated.language_code,
                autoDeleteLink: updated.auto_delete_link,
                showSender: updated.show_sender,
                showDescription: updated.show_description,
                checkDuplicates: updated.check_duplicates
            }).onConflictDoUpdate({
                target: chats.id,
                set: {
                    languageCode: updated.language_code,
                    autoDeleteLink: updated.auto_delete_link,
                    showSender: updated.show_sender,
                    showDescription: updated.show_description,
                    checkDuplicates: updated.check_duplicates,
                    updatedAt: new Date()
                }
            })
        } catch (error) {
            console.error('DB Error in updateChatSettings:', error)
        }
    }

    return updated
}

export async function checkIsDuplicate(chatId: number, mediaKey: string): Promise<DuplicateResult | null> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    if (db) {
        try {
            const rows = await db.select({
                id: mediaHistory.id,
                authorName: mediaHistory.authorName,
                messageId: mediaHistory.messageId
            }).from(mediaHistory).where(
                and(
                    eq(mediaHistory.chatId, chatId),
                    eq(mediaHistory.mediaKey, mediaKey),
                    gte(mediaHistory.createdAt, sevenDaysAgo)
                )
            ).limit(1)

            if (rows.length > 0) {
                return {
                    isDuplicate: true,
                    firstAuthor: rows[0].authorName || 'участник',
                    firstMessageId: rows[0].messageId || undefined
                }
            }
            return null
        } catch (error) {
            console.error('DB Error in checkIsDuplicate:', error)
        }
    }

    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000
    const found = memoryMediaHistory.find(
        (item) => item.chatId === chatId && item.mediaKey === mediaKey && item.timestamp > sevenDaysAgoMs
    )

    if (found) {
        return {
            isDuplicate: true,
            firstAuthor: found.authorName || 'участник',
            firstMessageId: found.messageId
        }
    }

    return null
}

export async function recordMediaHistory(chatId: number, userId: number, authorName: string, mediaKey: string, messageId?: number): Promise<void> {
    memoryMediaHistory.push({
        chatId,
        userId,
        authorName,
        mediaKey,
        messageId,
        timestamp: Date.now()
    })

    if (db) {
        try {
            await db.insert(mediaHistory).values({
                chatId,
                userId,
                authorName,
                mediaKey,
                messageId
            })
        } catch (error) {
            console.error('DB Error in recordMediaHistory:', error)
        }
    }
}

export async function removeMediaHistory(chatId: number, mediaKey: string): Promise<void> {
    if (db) {
        try {
            await db.delete(mediaHistory).where(
                and(
                    eq(mediaHistory.chatId, chatId),
                    eq(mediaHistory.mediaKey, mediaKey)
                )
            )
        } catch (error) {
            console.error('DB Error in removeMediaHistory:', error)
        }
    }

    for (let i = memoryMediaHistory.length - 1; i >= 0; i--) {
        if (memoryMediaHistory[i].chatId === chatId && memoryMediaHistory[i].mediaKey === mediaKey) {
            memoryMediaHistory.splice(i, 1)
        }
    }
}

export async function cleanupOldMediaHistory(): Promise<void> {
    if (db) {
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            await db.delete(mediaHistory).where(lt(mediaHistory.createdAt, sevenDaysAgo))
        } catch (error) {
            console.error('DB Error in cleanupOldMediaHistory:', error)
        }
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    for (let i = memoryMediaHistory.length - 1; i >= 0; i--) {
        if (memoryMediaHistory[i].timestamp < sevenDaysAgo) {
            memoryMediaHistory.splice(i, 1)
        }
    }
}

export async function getUserLanguage(userId: number): Promise<string | null> {
    const settings = await getUserSettings(userId)
    return settings.language_code
}

export async function setUserLanguage(userId: number, languageCode: string): Promise<void> {
    await updateUserSettings(userId, {
        language_code: languageCode
    })
}

export async function getChatLanguage(chatId: number): Promise<string | null> {
    const settings = await getChatSettings(chatId)
    return settings.language_code
}

export async function setChatLanguage(chatId: number, languageCode: string): Promise<void> {
    await updateChatSettings(chatId, {
        language_code: languageCode
    })
}
