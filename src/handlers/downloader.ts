import { getChatSettings, getUserSettings, checkIsDuplicate, recordMediaHistory, removeMediaHistory } from "@/db";
import { downloadMedia, extractSupportedUrl, cleanupFile, SupportedPlatform } from "@/downloader";
import type { CustomContext } from "@/i18n";
import { InputFile } from "grammy";

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getQuickMediaKey(url: string, platform: SupportedPlatform): string {
    try {
        const u = new URL(url)
        const path = u.pathname.replace(/\/$/, '')
        return `${platform}:${path}`
    } catch {
        return `${platform}:${url}`
    }
}

export async function handleMessageDownloader(ctx: CustomContext, next: () => Promise<void>): Promise<void> {
    const text = ctx.message?.text || ctx.channelPost?.text
    if (!text) return next()

    const match = extractSupportedUrl(text)
    if (!match) return next()

    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')

    let autoDeleteLink = true
    let showSender = true
    let showDescription = true
    let checkDuplicates = true

    if (isGroup && ctx.chat) {
        const s = await getChatSettings(ctx.chat.id)
        autoDeleteLink = s.auto_delete_link
        showSender = s.show_sender
        showDescription = s.show_description
        checkDuplicates = s.check_duplicates
    } else if (ctx.from) {
        const s = await getUserSettings(ctx.from.id)
        autoDeleteLink = s.auto_delete_link
        showDescription = s.show_description
    }

    const pingAuthorName = ctx.from
        ? (ctx.from.username ? `@${ctx.from.username}` : [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '))
        : ''

    const plainAuthorName = ctx.from
        ? (ctx.from.username || [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '))
        : ''

    const quickMediaKey = getQuickMediaKey(match.url, match.platform)

    if (isGroup && checkDuplicates && ctx.chat && ctx.from) {
        const dup = await checkIsDuplicate(ctx.chat.id, quickMediaKey)
        if (dup && dup.firstMessageId) {
            const escapedPingAuthor = escapeHtml(pingAuthorName || 'участник')
            const escapedFirstAuthor = escapeHtml(dup.firstAuthor.replace(/^@/, '') || 'участник')
            const escapedCurrentPlain = escapeHtml(plainAuthorName || 'участник')

            let warningText = ''
            if (escapedCurrentPlain === escapedFirstAuthor) {
                warningText = ctx.t('duplicate_warning_self').replace('{author}', escapedPingAuthor)
            } else {
                warningText = ctx.t('duplicate_warning')
                    .replace('{author}', escapedPingAuthor)
                    .replace('{first_author}', escapedFirstAuthor)
            }

            try {
                await ctx.reply(warningText, {
                    parse_mode: 'HTML',
                    reply_parameters: {
                        message_id: dup.firstMessageId
                    }
                })

                if (autoDeleteLink && ctx.message) {
                    try {
                        await ctx.api.deleteMessage(ctx.chat!.id, ctx.message.message_id)
                    } catch {}
                }
                return
            } catch (err: any) {
                const errMsg = err?.description || err?.message || ''
                if (errMsg.includes('message to be replied not found') || errMsg.includes('message not found')) {
                    await removeMediaHistory(ctx.chat.id, quickMediaKey)
                } else {
                    console.error('Error sending duplicate warning:', err)
                }
            }
        }
    }

    let statusMsg
    try {
        statusMsg = await ctx.reply(ctx.t('downloading'), {
            reply_parameters: ctx.message ? {
                message_id: ctx.message.message_id
            } : undefined
        })
    } catch {
        try {
            statusMsg = await ctx.reply(ctx.t('downloading'))
        } catch (err) {
            console.error('Failed to send status message:', err)
        }
    }

    let downloadedFilePath: string | null = null

    try {
        const result = await downloadMedia(match.url, match.platform)
        downloadedFilePath = result.filePath

        if (result.fileSizeMB > 50) {
            if (statusMsg) {
                await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, ctx.t('error_too_large'))
            } else {
                await ctx.reply(ctx.t('error_too_large'))
            }
            return
        }

        if (statusMsg) {
            try {
                await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, ctx.t('uploading'))
            } catch {}
        }

        const effectiveMediaKey = result.mediaKey || quickMediaKey

        if (isGroup && checkDuplicates && ctx.chat && ctx.from) {
            const dup = await checkIsDuplicate(ctx.chat.id, effectiveMediaKey)
            if (dup && dup.firstMessageId) {
                if (statusMsg) {
                    try {
                        await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id)
                    } catch {}
                }

                const escapedPingAuthor = escapeHtml(pingAuthorName || 'участник')
                const escapedFirstAuthor = escapeHtml(dup.firstAuthor.replace(/^@/, '') || 'участник')
                const escapedCurrentPlain = escapeHtml(plainAuthorName || 'участник')

                let warningText = ''
                if (escapedCurrentPlain === escapedFirstAuthor) {
                    warningText = ctx.t('duplicate_warning_self').replace('{author}', escapedPingAuthor)
                } else {
                    warningText = ctx.t('duplicate_warning')
                        .replace('{author}', escapedPingAuthor)
                        .replace('{first_author}', escapedFirstAuthor)
                }

                try {
                    await ctx.reply(warningText, {
                        parse_mode: 'HTML',
                        reply_parameters: {
                            message_id: dup.firstMessageId
                        }
                    })

                    if (autoDeleteLink && ctx.message) {
                        try {
                            await ctx.api.deleteMessage(ctx.chat!.id, ctx.message.message_id)
                        } catch {}
                    }
                    return
                } catch (err: any) {
                    const errMsg = err?.description || err?.message || ''
                    if (errMsg.includes('message to be replied not found') || errMsg.includes('message not found')) {
                        await removeMediaHistory(ctx.chat.id, effectiveMediaKey)
                    } else {
                        console.error('Error sending duplicate warning:', err)
                    }
                }
            }
        }

        const botUsername = ctx.me?.username ? `@${ctx.me.username}` : '@bot'
        const linkLabel = escapeHtml(ctx.t('link_label') || 'Перейти')
        const escapedUrl = escapeHtml(match.url)
        const linkHtml = `<a href="${escapedUrl}">${linkLabel}</a>`

        let headerLine = `${botUsername} | ${linkHtml}`

        if (isGroup && showSender && plainAuthorName) {
            headerLine += ` | ${escapeHtml(plainAuthorName)}`
        }

        let captionLines: string[] = [headerLine]

        if (showDescription && result.title) {
            captionLines.push(`🎥 ${escapeHtml(result.title)}`)
        }

        const fullCaptionText = captionLines.join('\n')

        let videoCaption: string | undefined = undefined
        let extraTextMessage: string | undefined = undefined

        if (fullCaptionText.length <= 1024) {
            videoCaption = fullCaptionText
        } else {
            videoCaption = headerLine
            extraTextMessage = showDescription && result.title ? `🎥 ${escapeHtml(result.title)}` : undefined
        }

        let sentVideoMsg
        try {
            sentVideoMsg = await ctx.replyWithVideo(new InputFile(result.filePath), {
                caption: videoCaption,
                parse_mode: 'HTML',
                reply_parameters: !autoDeleteLink && ctx.message ? {
                    message_id: ctx.message.message_id
                } : undefined
            })
        } catch {
            try {
                sentVideoMsg = await ctx.replyWithVideo(new InputFile(result.filePath), {
                    caption: videoCaption,
                    parse_mode: 'HTML'
                })
            } catch {
                sentVideoMsg = await ctx.replyWithVideo(new InputFile(result.filePath))
            }
        }

        if (isGroup && checkDuplicates && ctx.chat && ctx.from && sentVideoMsg) {
            await recordMediaHistory(ctx.chat.id, ctx.from.id, plainAuthorName, effectiveMediaKey, sentVideoMsg.message_id)
        }

        if (extraTextMessage) {
            try {
                await ctx.reply(extraTextMessage, {
                    parse_mode: 'HTML'
                })
            } catch {
                await ctx.reply(extraTextMessage)
            }
        }

        if (statusMsg) {
            try {
                await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id)
            } catch {}
        }

        if (autoDeleteLink && ctx.message) {
            try {
                await ctx.api.deleteMessage(ctx.chat!.id, ctx.message.message_id)
            } catch {}
        }
    } catch (error) {
        console.error('Error downloading/sending media:', error)
        if (statusMsg) {
            try {
                await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, ctx.t('error_download'))
            } catch {}
        } else {
            await ctx.reply(ctx.t('error_download'))
        }
    } finally {
        if (downloadedFilePath) {
            cleanupFile(downloadedFilePath)
        }
    }
}
