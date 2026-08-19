import { existsSync, mkdirSync, unlinkSync, statSync, readdirSync, writeFileSync, openSync, readSync, closeSync } from "fs";
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
const THREADS_REGEX = /https?:\/\/(?:www\.)?(?:threads\.net|threads\.com)\/(?:@[\w.-]+\/post\/[\w-]+|t\/[\w-]+|post\/[\w-]+|share\/[\w-]+)\/?(?:\?[^\s]*)?/i

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export type SupportedPlatform = 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'vk' | 'reddit' | 'pinterest' | 'threads'
export type MediaType = 'video' | 'photo'

export interface MediaDownloadResult {
    mediaType: MediaType
    filePaths: string[]
    title?: string
    mediaKey: string
    fileSizeMB: number
    width?: number
    height?: number
    duration?: number
}

export function parseMp4Metadata(filePath: string): { width: number; height: number; duration?: number } | null {
    try {
        const stats = statSync(filePath)
        const fd = openSync(filePath, 'r')
        const bufferSize = Math.min(stats.size, 1024 * 1024)
        const buffer = Buffer.alloc(bufferSize)
        readSync(fd, buffer, 0, bufferSize, 0)
        closeSync(fd)

        let timescale = 1000
        let movieDuration: number | undefined = undefined
        let trackWidth = 0
        let trackHeight = 0
        let isRotated = false

        function parseBoxes(start: number, end: number) {
            let pos = start
            while (pos + 8 <= end) {
                let size = buffer.readUInt32BE(pos)
                const type = buffer.toString('ascii', pos + 4, pos + 8)

                if (size === 1 && pos + 16 <= end) {
                    size = Number(buffer.readBigUInt64BE(pos + 8))
                } else if (size === 0) {
                    size = end - pos
                }

                if (size < 8) break
                const boxEnd = Math.min(pos + size, end)
                const payloadStart = pos + 8

                if (type === 'moov' || type === 'trak' || type === 'mdia') {
                    parseBoxes(payloadStart, boxEnd)
                } else if (type === 'mvhd') {
                    const version = buffer.readUInt8(payloadStart)
                    if (version === 0 && payloadStart + 20 <= boxEnd) {
                        timescale = buffer.readUInt32BE(payloadStart + 12)
                        const dur = buffer.readUInt32BE(payloadStart + 16)
                        if (timescale > 0) movieDuration = Math.round(dur / timescale)
                    } else if (version === 1 && payloadStart + 32 <= boxEnd) {
                        timescale = buffer.readUInt32BE(payloadStart + 20)
                        const dur = Number(buffer.readBigUInt64BE(payloadStart + 24))
                        if (timescale > 0) movieDuration = Math.round(dur / timescale)
                    }
                } else if (type === 'tkhd') {
                    const version = buffer.readUInt8(payloadStart)
                    const matrixOffset = payloadStart + (version === 0 ? 40 : 52)
                    if (matrixOffset + 36 + 8 <= boxEnd) {
                        const b = buffer.readInt32BE(matrixOffset + 4)
                        const c = buffer.readInt32BE(matrixOffset + 12)
                        if (b !== 0 || c !== 0) {
                            isRotated = true
                        }
                        const widthOffset = matrixOffset + 36
                        const w = buffer.readUInt16BE(widthOffset)
                        const h = buffer.readUInt16BE(widthOffset + 4)
                        if (w > 0 && h > 0) {
                            trackWidth = w
                            trackHeight = h
                        }
                    }
                }

                pos += size
            }
        }

        parseBoxes(0, bufferSize)

        if (trackWidth > 0 && trackHeight > 0) {
            let finalWidth = trackWidth
            let finalHeight = trackHeight
            if (isRotated) {
                finalWidth = trackHeight
                finalHeight = trackWidth
            }
            return {
                width: finalWidth,
                height: finalHeight,
                duration: movieDuration
            }
        }
        return null
    } catch {
        return null
    }
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

    const threadsMatch = text.match(THREADS_REGEX)
    if (threadsMatch) return {
        url: threadsMatch[0],
        platform: 'threads'
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

async function fetchTikTokApi(url: string, tempDir: string, filePrefix: string): Promise<MediaDownloadResult | null> {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 12000)

        const res = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': USER_AGENT
            },
            body: new URLSearchParams({ url, hd: '1' }),
            signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!res.ok) return null
        const json = await res.json()
        if (json.code !== 0 || !json.data) return null

        const data = json.data
        const title = data.title || undefined
        const duration = typeof data.duration === 'number' && data.duration > 0 ? data.duration : undefined

        if (Array.isArray(data.images) && data.images.length > 0) {
            const photoFiles: string[] = []
            for (let i = 0; i < data.images.length; i++) {
                const imgUrl = data.images[i]
                try {
                    const c = new AbortController()
                    const tId = setTimeout(() => c.abort(), 10000)
                    const imgRes = await fetch(imgUrl, {
                        headers: { 'User-Agent': USER_AGENT },
                        signal: c.signal
                    })
                    clearTimeout(tId)
                    if (imgRes.ok) {
                        const arrayBuf = await imgRes.arrayBuffer()
                        const photoName = `${filePrefix}_slide_${String(i + 1).padStart(2, '0')}.jpg`
                        const photoPath = join(tempDir, photoName)
                        writeFileSync(photoPath, Buffer.from(arrayBuf))
                        photoFiles.push(photoName)
                    }
                } catch {}
            }

            if (photoFiles.length > 0) {
                const filePaths = photoFiles.map((f) => join(tempDir, f))
                let totalSizeBytes = 0
                for (const p of filePaths) {
                    try {
                        totalSizeBytes += statSync(p).size
                    } catch {}
                }
                return {
                    mediaType: 'photo',
                    filePaths,
                    title,
                    mediaKey: `tiktok:${data.id || url}`,
                    fileSizeMB: totalSizeBytes / (1024 * 1024)
                }
            }
        } else {
            const videoUrl = data.hdplay || data.play || data.wmplay
            if (videoUrl && typeof videoUrl === 'string') {
                const c = new AbortController()
                const tId = setTimeout(() => c.abort(), 20000)
                const videoRes = await fetch(videoUrl, {
                    headers: { 'User-Agent': USER_AGENT },
                    signal: c.signal
                })
                clearTimeout(tId)

                if (videoRes.ok) {
                    const arrayBuf = await videoRes.arrayBuffer()
                    const videoName = `${filePrefix}.mp4`
                    const videoPath = join(tempDir, videoName)
                    writeFileSync(videoPath, Buffer.from(arrayBuf))
                    const stats = statSync(videoPath)
                    const mp4Meta = parseMp4Metadata(videoPath)
                    return {
                        mediaType: 'video',
                        filePaths: [videoPath],
                        title,
                        mediaKey: `tiktok:${data.id || url}`,
                        fileSizeMB: stats.size / (1024 * 1024),
                        width: mp4Meta?.width,
                        height: mp4Meta?.height,
                        duration: mp4Meta?.duration || duration
                    }
                }
            }
        }
    } catch (err) {
        console.warn('TikWM API fetch error:', err)
    }
    return null
}

async function resolveRedirectUrl(url: string): Promise<string> {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: controller.signal
        })
        clearTimeout(timeoutId)
        if (response.url && response.url !== url) {
            return response.url
        }
    } catch {}
    return url
}

async function fetchThreadsDirect(url: string, tempDir: string, filePrefix: string): Promise<MediaDownloadResult | null> {
    try {
        let targetUrl = url
        if (targetUrl.includes('/share/')) {
            targetUrl = await resolveRedirectUrl(targetUrl)
        }
        targetUrl = targetUrl.replace('threads.com', 'threads.net')

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const res = await fetch(targetUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'none'
            },
            signal: controller.signal
        })
        clearTimeout(timeoutId)
        const html = await res.text()

        const videoUrls: string[] = []
        const videoMatches = html.match(/"video_versions":\s*\[(.*?)\]/gs)
        if (videoMatches) {
            for (const vm of videoMatches) {
                const urlMatches = vm.match(/"url":\s*"([^"]+)"/g)
                if (urlMatches) {
                    for (const u of urlMatches) {
                        const rawUrl = u.replace(/"url":\s*"/, '').replace(/"$/, '').replace(/\\u0026/g, '&').replace(/\\/g, '')
                        if (rawUrl.startsWith('http') && !videoUrls.includes(rawUrl)) {
                            videoUrls.push(rawUrl)
                        }
                    }
                }
            }
        }

        const rawMp4 = html.match(/https?:\\?\/\\?\/[^"'\s<>]+\.mp4[^"'\s<>]*/g) || html.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/g)
        if (rawMp4) {
            for (const m of rawMp4) {
                const clean = m.replace(/\\/g, '').replace(/&amp;/g, '&').replace(/\\u0026/g, '&')
                if (!videoUrls.includes(clean)) {
                    videoUrls.push(clean)
                }
            }
        }

        for (const cleanVideoUrl of videoUrls) {
            try {
                const vController = new AbortController()
                const vTimeout = setTimeout(() => vController.abort(), 25000)
                const videoRes = await fetch(cleanVideoUrl, {
                    headers: {
                        'User-Agent': USER_AGENT
                    },
                    signal: vController.signal
                })
                clearTimeout(vTimeout)
                if (videoRes.ok) {
                    const arrayBuffer = await videoRes.arrayBuffer()
                    const buffer = Buffer.from(arrayBuffer)
                    if (buffer.length > 50000) {
                        const filePath = join(tempDir, `${filePrefix}_01.mp4`)
                        writeFileSync(filePath, buffer)
                        const stats = statSync(filePath)
                        const mp4Meta = parseMp4Metadata(filePath)

                        const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1]
                        const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1]
                        const title = ogTitle || ogDesc

                        return {
                            mediaType: 'video',
                            filePaths: [filePath],
                            title,
                            mediaKey: url,
                            fileSizeMB: stats.size / (1024 * 1024),
                            width: mp4Meta?.width,
                            height: mp4Meta?.height,
                            duration: mp4Meta?.duration
                        }
                    }
                }
            } catch {}
        }

        const imageUrls: string[] = []
        const imageMatches = html.match(/"image_versions2":\s*\{.*?"candidates":\s*\[(.*?)\]/gs)
        if (imageMatches) {
            for (const im of imageMatches) {
                const urlMatches = im.match(/"url":\s*"([^"]+)"/g)
                if (urlMatches) {
                    const firstUrl = urlMatches[0].replace(/"url":\s*"/, '').replace(/"$/, '').replace(/\\u0026/g, '&').replace(/\\/g, '')
                    if (firstUrl.startsWith('http') && !imageUrls.includes(firstUrl)) {
                        imageUrls.push(firstUrl)
                    }
                }
            }
        }

        const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] ||
            html.match(/<meta content="([^"]+)" property="og:image"/i)?.[1]
        if (ogImage) {
            const clean = ogImage.replace(/&amp;/g, '&')
            if (!imageUrls.includes(clean)) {
                imageUrls.push(clean)
            }
        }

        if (imageUrls.length > 0) {
            const downloadedPhotos: string[] = []
            for (let i = 0; i < imageUrls.length; i++) {
                try {
                    const imgController = new AbortController()
                    const imgTimeout = setTimeout(() => imgController.abort(), 10000)
                    const imgRes = await fetch(imageUrls[i], {
                        headers: {
                            'User-Agent': USER_AGENT
                        },
                        signal: imgController.signal
                    })
                    clearTimeout(imgTimeout)
                    if (imgRes.ok) {
                        const arrayBuffer = await imgRes.arrayBuffer()
                        const photoPath = join(tempDir, `${filePrefix}_${String(i + 1).padStart(2, '0')}.jpg`)
                        writeFileSync(photoPath, Buffer.from(arrayBuffer))
                        downloadedPhotos.push(photoPath)
                    }
                } catch {}
            }

            if (downloadedPhotos.length > 0) {
                return {
                    mediaType: 'photo',
                    filePaths: downloadedPhotos,
                    mediaKey: url,
                    fileSizeMB: statSync(downloadedPhotos[0]).size / (1024 * 1024)
                }
            }
        }
    } catch (err) {
        console.warn('Direct Threads extraction error:', err)
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

    const filePrefix = `media_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const outputTemplate = join(tempDir, `${filePrefix}_%(playlist_index|autonumber)02d.%(ext)s`)

    if (platform === 'tiktok') {
        const directResult = await fetchTikTokApi(url, tempDir, filePrefix)
        if (directResult) {
            return directResult
        }
    }

    const spawnEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        PYTHONIOENCODING: 'utf-8',
        LANG: 'en_US.UTF-8'
    }

    let title: string | undefined = undefined
    let rawId: string | undefined = undefined
    let rawMeta: any = null
    let width: number | undefined = undefined
    let height: number | undefined = undefined
    let duration: number | undefined = undefined

    let targetUrl = url
    if (platform === 'tiktok') {
        targetUrl = targetUrl.replace(/\/photo\//i, '/video/')
    }
    if (platform === 'threads') {
        if (targetUrl.includes('/share/')) {
            targetUrl = await resolveRedirectUrl(targetUrl)
        }
        targetUrl = targetUrl.replace('threads.com', 'threads.net')
        if (targetUrl.includes('/post/') || targetUrl.includes('/t/')) {
            targetUrl = targetUrl.split('?')[0]
        }
    }

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

            if (typeof rawMeta.width === 'number' && rawMeta.width > 0) {
                width = rawMeta.width
            }
            if (typeof rawMeta.height === 'number' && rawMeta.height > 0) {
                height = rawMeta.height
            }
            if (typeof rawMeta.duration === 'number' && rawMeta.duration > 0) {
                duration = Math.round(rawMeta.duration)
            }
        }
    } catch (err) {
        console.warn('Could not extract media metadata JSON:', err)
    }

    let downloadResult = await spawnProcess(
        binPath,
        [
            ...commonArgs,
            '-f', 'bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=h264]+bestaudio[acodec^=aac]/best[vcodec^=avc]/best[vcodec^=h264]/b[ext=mp4]/bestvideo+bestaudio/best',
            '--merge-output-format', 'mp4',
            '--ppa', 'Merger+ffmpeg:-movflags +faststart',
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
                '-f', 'b/best/bestvideo+bestaudio',
                '--merge-output-format', 'mp4',
                '--ppa', 'Merger+ffmpeg:-movflags +faststart',
                '-o', outputTemplate,
                '--no-warnings',
                targetUrl
            ],
            spawnEnv
        )
    }

    if (downloadResult.exitCode !== 0 && (platform === 'pinterest' || platform === 'reddit')) {
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

    const files = readdirSync(tempDir)
        .filter((f) => f.startsWith(filePrefix))
        .sort()

    const videoExtensions = ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.flv']
    const photoExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif']

    let videoFiles = files.filter((f) => videoExtensions.some((ext) => f.toLowerCase().endsWith(ext)))
    let photoFiles = files.filter((f) => photoExtensions.some((ext) => f.toLowerCase().endsWith(ext)))

    if (platform === 'tiktok' && videoFiles.length === 0 && photoFiles.length === 0) {
        const fallbackResult = await fetchTikTokApi(url, tempDir, filePrefix)
        if (fallbackResult) {
            return fallbackResult
        }
    }

    if (platform === 'threads' && videoFiles.length === 0) {
        const fallbackThreads = await fetchThreadsDirect(url, tempDir, filePrefix)
        if (fallbackThreads) {
            return fallbackThreads
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
                        headers: {
                            'User-Agent': USER_AGENT
                        },
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
        if (downloadResult.exitCode !== 0) {
            console.error('yt-dlp stderr:', downloadResult.stderr)
            throw new Error(`yt-dlp exited with code ${downloadResult.exitCode}`)
        }
        throw new Error('No valid video or photo media found in link.')
    }

    const mediaType: MediaType = videoFiles.length > 0 ? 'video' : 'photo'
    const targetFiles = videoFiles.length > 0 ? videoFiles : photoFiles
    const filePaths = targetFiles.map((f) => join(tempDir, f))

    if (mediaType === 'video' && filePaths.length > 0) {
        const mp4Meta = parseMp4Metadata(filePaths[0])
        if (mp4Meta) {
            width = mp4Meta.width
            height = mp4Meta.height
            if (mp4Meta.duration) duration = mp4Meta.duration
        }
    }

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
        fileSizeMB,
        width,
        height,
        duration
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
