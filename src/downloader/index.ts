import { existsSync, mkdirSync, unlinkSync, statSync, readdirSync } from "fs";
import { getBinPath } from "@/downloader/bin";
import { spawn } from "child_process";
import { join } from "path";
import { tmpdir } from "os";

const INSTAGRAM_REGEX = /https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?(?:\?[^\s]*)?/i
const TIKTOK_REGEX = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/(?:@[\w.-]+\/video\/\d+|[\w.-]+|\w+)\/?(?:\?[^\s]*)?/i
const YOUTUBE_SHORTS_REGEX = /https?:\/\/(?:www\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]+\/?(?:\?[^\s]*)?/i
const TWITTER_X_REGEX = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/(?:[\w.-]+)\/status\/\d+\/?(?:\?[^\s]*)?/i
const VK_REGEX = /https?:\/\/(?:www\.)?(?:vk\.com|vk\.ru)\/(?:clip|video)[-?\d_]+\/?(?:\?[^\s]*)?/i
const REDDIT_REGEX = /https?:\/\/(?:www\.)?(?:reddit\.com\/r\/[\w.-]+\/comments\/\w+(?:\/[\w.-]*)?|v\.redd\.it\/\w+)\/?(?:\?[^\s]*)?/i
const PINTEREST_REGEX = /https?:\/\/(?:www\.)?(?:pinterest\.[a-z.]+\/pin\/\d+|pin\.it\/\w+)\/?(?:\?[^\s]*)?/i

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export type SupportedPlatform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'vk' | 'reddit' | 'pinterest'

export interface MediaDownloadResult {
    filePath: string
    title?: string
    mediaKey: string
    fileSizeMB: number
}

function spawnProcess(binPath: string, args: string[], spawnEnv: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
        const proc = spawn(binPath, args, {
            env: spawnEnv
        })

        let stdout = ''
        let stderr = ''

        if (proc.stdout) {
            proc.stdout.on('data', (chunk) => {
                stdout += chunk.toString('utf-8')
            })
        }

        if (proc.stderr) {
            proc.stderr.on('data', (chunk) => {
                stderr += chunk.toString('utf-8')
            })
        }

        proc.on('close', (code) => {
            resolve({
                stdout,
                stderr,
                exitCode: code ?? 1
            })
        })

        proc.on('error', (err) => {
            resolve({
                stdout,
                stderr: err.message,
                exitCode: 1
            })
        })
    })
}

export function extractSupportedUrl(text: string): { url: string; platform: SupportedPlatform } | null {
    const igMatch = text.match(INSTAGRAM_REGEX)
    if (igMatch) return {
        url: igMatch[0],
        platform: 'instagram'
    }

    const ttMatch = text.match(TIKTOK_REGEX)
    if (ttMatch) return {
        url: ttMatch[0],
        platform: 'tiktok'
    }

    const ytMatch = text.match(YOUTUBE_SHORTS_REGEX)
    if (ytMatch) return {
        url: ytMatch[0],
        platform: 'youtube'
    }

    const txMatch = text.match(TWITTER_X_REGEX)
    if (txMatch) return {
        url: txMatch[0],
        platform: 'twitter'
    }

    const vkMatch = text.match(VK_REGEX)
    if (vkMatch) return {
        url: vkMatch[0],
        platform: 'vk'
    }

    const redditMatch = text.match(REDDIT_REGEX)
    if (redditMatch) return {
        url: redditMatch[0],
        platform: 'reddit'
    }

    const pinMatch = text.match(PINTEREST_REGEX)
    if (pinMatch) return {
        url: pinMatch[0],
        platform: 'pinterest'
    }

    return null
}

export async function downloadMedia(url: string, platform: SupportedPlatform): Promise<MediaDownloadResult> {
    const binPath = getBinPath()
    const tempDir = join(tmpdir(), 'telegram_dwbot')

    if (!existsSync(tempDir)) {
        mkdirSync(tempDir, {
            recursive: true
        })
    }

    const filePrefix = `video_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const outputTemplate = join(tempDir, `${filePrefix}.%(ext)s`)

    const spawnEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        PYTHONIOENCODING: 'utf-8',
        LANG: 'en_US.UTF-8'
    }

    let title: string | undefined = undefined
    let rawId: string | undefined = undefined

    try {
        const metaResult = await spawnProcess(
            binPath,
            [
                '--no-playlist',
                '--encoding', 'utf-8',
                '--user-agent', USER_AGENT,
                '--extractor-args', 'youtube:player_client=android,web',
                '--dump-json',
                '--skip-download',
                '--no-warnings',
                url
            ],
            spawnEnv
        )

        if (metaResult.stdout.trim()) {
            const data = JSON.parse(metaResult.stdout.trim())
            title = formatCaption(data)
            rawId = data.id || data.display_id || data.webpage_url_basename
        }
    } catch (err) {
        console.warn('Could not extract video metadata JSON:', err)
    }

    const downloadResult = await spawnProcess(
        binPath,
        [
            '--no-playlist',
            '--encoding', 'utf-8',
            '--user-agent', USER_AGENT,
            '--extractor-args', 'youtube:player_client=android,web',
            '-f', 'b[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '-o', outputTemplate,
            '--no-warnings',
            url
        ],
        spawnEnv
    )

    if (downloadResult.exitCode !== 0) {
        console.error('yt-dlp stderr:', downloadResult.stderr)
        throw new Error(`yt-dlp exited with code ${downloadResult.exitCode}`)
    }

    const files = readdirSync(tempDir)
    const downloadedFileName = files.find((f) => f.startsWith(filePrefix))

    if (!downloadedFileName) {
        throw new Error('Downloaded file not found in temp folder.')
    }

    const filePath = join(tempDir, downloadedFileName)
    const stats = statSync(filePath)
    const fileSizeMB = stats.size / (1024 * 1024)
    const mediaKey = `${platform}:${rawId || url}`

    return {
        filePath,
        title: title || undefined,
        mediaKey,
        fileSizeMB
    }
}

function formatCaption(json: any): string | undefined {
    const candidates: string[] = []

    if (typeof json.description === 'string' && json.description.trim()) {
        candidates.push(json.description.trim())
    }
    if (typeof json.fulltitle === 'string' && json.fulltitle.trim()) {
        candidates.push(json.fulltitle.trim())
    }
    if (typeof json.title === 'string' && json.title.trim()) {
        candidates.push(json.title.trim())
    }

    const validCandidates = candidates.filter(
        (text) => !/^TikTok video #\d+$/i.test(text)
    )

    if (validCandidates.length === 0) return undefined

    validCandidates.sort((a, b) => b.length - a.length)

    return validCandidates[0]
}

export function cleanupFile(filePath: string): void {
    try {
        if (existsSync(filePath)) {
            unlinkSync(filePath)
        }
    } catch (err) {
        console.error(`Failed to cleanup temp file ${filePath}:`, err)
    }
}
