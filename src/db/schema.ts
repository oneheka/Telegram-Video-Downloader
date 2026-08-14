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
    enableReactions: boolean('enable_reactions').notNull().default(true),
    reactionButtons: varchar('reaction_buttons', {
        length: 255
    }).notNull().default('👍,❤️,🔥,😂,🤡,💩,🤮'),
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
    enableReactions: boolean('enable_reactions').notNull().default(true),
    reactionButtons: varchar('reaction_buttons', {
        length: 255
    }).notNull().default('👍,❤️,🔥,😂,🤡,💩,🤮'),
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

export const mediaMessages = pgTable('media_messages', {
    id: bigserial('id', {
        mode: 'number'
    }).primaryKey(),
    chatId: bigint('chat_id', {
        mode: 'number'
    }).notNull(),
    messageId: bigint('message_id', {
        mode: 'number'
    }).notNull(),
    baseCaption: varchar('base_caption', {
        length: 2048
    }).notNull().default(''),
    createdAt: timestamp('created_at', {
        withTimezone: true,
        mode: 'date'
    }).defaultNow()
}, (table) => [
    index('idx_media_messages_chat_msg').on(table.chatId, table.messageId),
    index('idx_media_messages_created').on(table.createdAt)
])

export const mediaReactions = pgTable('media_reactions', {
    id: bigserial('id', {
        mode: 'number'
    }).primaryKey(),
    chatId: bigint('chat_id', {
        mode: 'number'
    }).notNull(),
    messageId: bigint('message_id', {
        mode: 'number'
    }).notNull(),
    userId: bigint('user_id', {
        mode: 'number'
    }).notNull(),
    userName: varchar('user_name', {
        length: 255
    }).notNull().default(''),
    emoji: varchar('emoji', {
        length: 32
    }).notNull(),
    updatedAt: timestamp('updated_at', {
        withTimezone: true,
        mode: 'date'
    }).defaultNow()
}, (table) => [
    index('idx_media_reactions_lookup').on(table.chatId, table.messageId, table.emoji),
    index('idx_media_reactions_user').on(table.chatId, table.messageId, table.userId, table.emoji)
])
