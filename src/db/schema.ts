import { pgTable, bigint, bigserial, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
    id: bigint('id', {
        mode: 'number'
    }).primaryKey(),
    languageCode: varchar('language_code', {
        length: 10
    }).notNull().default('en'),
    autoDeleteLink: boolean('auto_delete_link').notNull().default(true),
    showDescription: boolean('show_description').notNull().default(true),
    updatedAt: timestamp('updated_at', {
        withTimezone: true,
        mode: 'date'
    }).defaultNow()
})

export const chats = pgTable('chats', {
    id: bigint('id', {
        mode: 'number'
    }).primaryKey(),
    languageCode: varchar('language_code', {
        length: 10
    }).notNull().default('en'),
    autoDeleteLink: boolean('auto_delete_link').notNull().default(true),
    showSender: boolean('show_sender').notNull().default(true),
    showDescription: boolean('show_description').notNull().default(true),
    checkDuplicates: boolean('check_duplicates').notNull().default(true),
    updatedAt: timestamp('updated_at', {
        withTimezone: true,
        mode: 'date'
    }).defaultNow()
})

export const mediaHistory = pgTable('media_history', {
    id: bigserial('id', {
        mode: 'number'
    }).primaryKey(),
    chatId: bigint('chat_id', {
        mode: 'number'
    }).notNull(),
    userId: bigint('user_id', {
        mode: 'number'
    }).notNull(),
    authorName: varchar('author_name', {
        length: 255
    }).notNull().default(''),
    mediaKey: varchar('media_key', {
        length: 255
    }).notNull(),
    messageId: bigint('message_id', {
        mode: 'number'
    }),
    createdAt: timestamp('created_at', {
        withTimezone: true,
        mode: 'date'
    }).defaultNow()
}, (table) => [
    index('idx_media_history_chat_key').on(table.chatId, table.mediaKey),
    index('idx_media_history_created').on(table.createdAt)
])
