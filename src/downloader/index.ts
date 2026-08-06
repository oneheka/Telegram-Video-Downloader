import { existsSync, mkdirSync, unlinkSync, statSync, readdirSync, writeFileSync } from "fs";
import { getBinPath } from "@/downloader/bin";
import { spawn } from "child_process";
import { join } from "path";
import { tmpdir } from "os";

const INSTAGRAM_REGEX = /https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv|share\/(?:p|reel))\/[A-Za-z0-9_-]+\/?(?:\?[^\s]*)?/i
const TIKTOK_REGEX = /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/(?:@[\w.-]+\/(?:video|photo)\/\d+|[\w.-]+|\w+)\/?(?:\?[^\s]*)?/i
const YOUTUBE_SHORTS_REGEX = /https?:\/\/(?:www\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]+\/?(?:\?[^\s]*)?/i
const TWITTER_X_REGEX = /https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/(?:[\w.-]+)\/status\/\d+\/?(?:\?[^\s]*)?/i
const VK_REGEX = /https?:\/\/(?:www\.|m\.)?(?:vk\.com|vk\.ru)\/(?:clip|video|wall)[-?\d_]+\/?(?:\?[^\s]*)?/i
const REDDIT_REGEX = /https?:\/\/(?:www\.)?(?:reddit\.com\/r\/[\w.-]+\/comments\/\w+(?:\/[\w.-]*)?|[vi]\.redd\.it\/\w+)\/?(?:\?[^\s]*)?/i
const PINTEREST_REGEX = /https?:\/\/(?:www\.)?(?:pinterest\.[a-z.]+\/pin\/\d+|pin\.it\/[\w-]+)\/?(?:\?[^\s]*)?/i

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export type SupportedPlatform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'vk' | 'reddit' | 'pinterest'
export type MediaType = 'video' | 'photo'

export interface MediaDownloadResult {
    mediaType: MediaType
    filePaths: string[]
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

export function extractImageUrls(data: any): string[] {
    if (!data) return []

    const urls: string[] = []

    if (Array.isArray(data.entries) && data.entries.length > 0) {
        for (const entry of data.entries) {
            const childUrls = extractImageUrls(entry)
            urls.push(...childUrls)
        }
        if (urls.length > 0) {
            return Array.from(new Set(urls))
        }
    }

    if (Array.isArray(data.images) && data.images.length > 0) {
        for (const img of data.images) {
            if (typeof img === 'string' && img.startsWith('http')) {
                urls.push(img)
            } else if (img && typeof img.url === 'string' && img.url.startsWith('http')) {
                urls.push(img.url)
            }
        }
        if (urls.length > 0) {
            return Array.from(new Set(urls))
        }
    }

    if (Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
        const validThumbnails = data.thumbnails.filter(
            (t: any) => t && typeof t.url === 'string' && t.url.startsWith('http')
        )

        const bySlide = new Map<string, any[]>()
        for (const t of validThumbnails) {
            let slideKey: string | null = null
            if (t.id != null) {
                const strId = String(t.id)
                const match = strId.match(/\d+/)
                if (match) {
                    slideKey = match[0]
                } else {
                    slideKey = strId
                }
            }
            if (slideKey) {
                if (!bySlide.has(slideKey)) bySlide.set(slideKey, [])
                bySlide.get(slideKey)!.push(t)
            }
        }

        if (bySlide.size > 1) {
            const sortedKeys = Array.from(bySlide.keys()).sort((a, b) => {
                const numA = parseInt(a, 10)
                const numB = parseInt(b, 10)
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB
                return a.localeCompare(b)
            })
            for (const key of sortedKeys) {
                const thumbs = bySlide.get(key)!
                thumbs.sort((a: any, b: any) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))
                urls.push(thumbs[0].url)
            }
        } else if (validThumbnails.length > 0) {
            const uniqueBases = new Map<string, any>()
            for (const t of validThumbnails) {
                const basePath = t.url.split('?')[0]
                if (!uniqueBases.has(basePath)) {
                    uniqueBases.set(basePath, t)
                }
            }
            for (const t of uniqueBases.values()) {
                urls.push(t.url)
            }
        }

        if (urls.length > 0) {
            return Array.from(new Set(urls))
        }
    }

    if (typeof data.url === 'string' && data.url.startsWith('http')) {
        const ext = data.url.split('?')[0].toLowerCase()
        if (['.jpg', '.jpeg', '.png', '.webp', '.heic'].some((e) => ext.endsWith(e))) {
            urls.push(data.url)
        }
    }

    return Array.from(new Set(urls))
}

async function fetchTikTokPhotoPost(url: string): Promise<{ images: string[]; title?: string } | null> {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const res = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': USER_AGENT
            },
            body: new URLSearchParams({ url }),
            signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!res.ok) return null
        const json = await res.json()
        if (json.code === 0 && json.data) {
            const images: string[] = []
            if (Array.isArray(json.data.images) && json.data.images.length > 0) {
                for (const img of json.data.images) {
                    if (typeof img === 'string' && img.startsWith('http')) {
                        images.push(img)
                    }
                }
            }
            return {
                images: Array.from(new Set(images)),
                title: json.data.title || undefined
            }
        }
    } catch (err) {
        console.warn('TikWM API fetch failed:', err)
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

    let targetUrl = url
    if (platform === 'tiktok') {
        targetUrl = targetUrl.replace(/\/photo\//i, '/video/')
    }

    const filePrefix = `media_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const outputTemplate = join(tempDir, `${filePrefix}_%(playlist_index|autonumber)02d.%(ext)s`)

    const spawnEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        PYTHONIOENCODING: 'utf-8',
        LANG: 'en_US.UTF-8'
    }

    let title: string | undefined = undefined
    let rawId: string | undefined = undefined
    let rawMeta: any = null

    const commonArgs = [
        '--encoding', 'utf-8',
        '--user-agent', USER_AGENT,
        '--extractor-args', 'youtube:player_client=android,web'
    ]
    if (platform === 'youtube') {
        commonArgs.unshift('--no-playlist')
    }

    try {
        const metaResult = await spawnProcess(
            binPath,
            [
                ...commonArgs,
                '--dump-json',
                '--skip-download',
                '--no-warnings',
                targetUrl
            ],
            spawnEnv
        )

        if (metaResult.stdout.trim()) {
            rawMeta = JSON.parse(metaResult.stdout.trim().split('\n')[0])
            title = formatCaption(rawMeta)
            rawId = rawMeta.id || rawMeta.display_id || rawMeta.webpage_url_basename
        }
    } catch (err) {
        console.warn('Could not extract media metadata JSON:', err)
    }

    let downloadResult = await spawnProcess(
        binPath,
        [
            ...commonArgs,
            '-f', 'b[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '-o', outputTemplate,
            '--no-warnings',
            targetUrl
        ],
        spawnEnv
    )

    if (downloadResult.exitCode !== 0) {
        downloadResult = await spawnProcess(
            binPath,
            [
                ...commonArgs,
                '--write-all-thumbnails',
                '--convert-thumbnails', 'jpg',
                '-o', outputTemplate,
                '--no-warnings',
                targetUrl
            ],
            spawnEnv
        )
    }

    if (downloadResult.exitCode !== 0) {
        console.error('yt-dlp stderr:', downloadResult.stderr)
        throw new Error(`yt-dlp exited with code ${downloadResult.exitCode}`)
    }

    const files = readdirSync(tempDir)
        .filter((f) => f.startsWith(filePrefix))
        .sort()

    const videoExtensions = ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.flv']
    const photoExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif']

    let videoFiles = files.filter((f) => videoExtensions.some((ext) => f.toLowerCase().endsWith(ext)))
    let photoFiles = files.filter((f) => photoExtensions.some((ext) => f.toLowerCase().endsWith(ext)))

    if (platform === 'tiktok' && videoFiles.length === 0 && photoFiles.length <= 1) {
        const tikwmData = await fetchTikTokPhotoPost(url)
        if (tikwmData && tikwmData.images.length > 0) {
            if (!title && tikwmData.title) {
                title = tikwmData.title
            }
            const downloaded: string[] = []
            for (let i = 0; i < tikwmData.images.length; i++) {
                const imgUrl = tikwmData.images[i]
                try {
                    const controller = new AbortController()
                    const timeoutId = setTimeout(() => controller.abort(), 10000)
                    const res = await fetch(imgUrl, {
                        headers: { 'User-Agent': USER_AGENT },
                        signal: controller.signal
                    })
                    clearTimeout(timeoutId)
                    if (res.ok) {
                        const arrayBuf = await res.arrayBuffer()
                        const photoName = `${filePrefix}_slide_${String(i + 1).padStart(2, '0')}.jpg`
                        const photoPath = join(tempDir, photoName)
                        writeFileSync(photoPath, Buffer.from(arrayBuf))
                        downloaded.push(photoName)
                    }
                } catch (e) {
                    console.warn(`Failed to fetch TikTok slide image ${imgUrl}:`, e)
                }
            }
            if (downloaded.length > 0) {
                photoFiles = downloaded
            }
        }
    }

    if (videoFiles.length === 0 && photoFiles.length === 0 && rawMeta) {
        const extractedUrls = extractImageUrls(rawMeta)
        if (extractedUrls.length > 0) {
            const downloaded: string[] = []
            for (let i = 0; i < extractedUrls.length; i++) {
                const imgUrl = extractedUrls[i]
                try {
                    const controller = new AbortController()
                    const timeoutId = setTimeout(() => controller.abort(), 10000)
                    const res = await fetch(imgUrl, {
                        headers: { 'User-Agent': USER_AGENT },
                        signal: controller.signal
                    })
                    clearTimeout(timeoutId)
                    if (res.ok) {
                        const arrayBuf = await res.arrayBuffer()
                        const photoName = `${filePrefix}_extracted_${String(i + 1).padStart(2, '0')}.jpg`
                        const photoPath = join(tempDir, photoName)
                        writeFileSync(photoPath, Buffer.from(arrayBuf))
                        downloaded.push(photoName)
                    }
                } catch (e) {
                    console.warn(`Failed to fetch extracted image ${imgUrl}:`, e)
                }
            }
            if (downloaded.length > 0) {
                photoFiles = downloaded
            }
        }
    }

    if (videoFiles.length === 0 && photoFiles.length === 0) {
        throw new Error('No valid video or photo media found in link.')
    }

    const mediaType: MediaType = videoFiles.length > 0 ? 'video' : 'photo'
    const targetFiles = videoFiles.length > 0 ? videoFiles : photoFiles
    const filePaths = targetFiles.map((f) => join(tempDir, f))

    let totalSizeBytes = 0
    for (const p of filePaths) {
        try {
            totalSizeBytes += statSync(p).size
        } catch {}
    }
    const fileSizeMB = totalSizeBytes / (1024 * 1024)
    const mediaKey = `${platform}:${rawId || url}`

    return {
        mediaType,
        filePaths,
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

export function cleanupFiles(filePaths: string[]): void {
    for (const p of filePaths) {
        cleanupFile(p)
    }
}
