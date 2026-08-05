import { existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { writeFile } from "fs/promises";
import { join } from "path";

export function getBinPath(): string {
    const isWin = process.platform === 'win32'
    const binDir = join(process.cwd(), 'bin')
    const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp'
    const localBinPath = join(binDir, binName)

    return localBinPath
}

export async function ensureYtDlpBinary(): Promise<string> {
    const isWin = process.platform === 'win32'
    const binDir = join(process.cwd(), 'bin')
    const binPath = getBinPath()

    if (existsSync(binPath)) {
        if (!isWin) {
            try {
                execSync(`chmod +x "${binPath}"`)
            } catch {}
        }
        return binPath
    }

    if (!existsSync(binDir)) {
        mkdirSync(binDir, {
            recursive: true
        })
    }

    console.log(`⏬ Downloading yt-dlp binary to ${binPath}…`)

    const downloadUrl = isWin
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'

    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const res = await fetch(downloadUrl, {
            signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!res.ok || !res.body) {
            throw new Error(`Failed to download yt-dlp: HTTP ${res.status}`)
        }

        const arrayBuffer = await res.arrayBuffer()
        await writeFile(binPath, Buffer.from(arrayBuffer))

        if (!isWin) {
            execSync(`chmod +x "${binPath}"`)
        }

        console.log('✅ yt-dlp binary downloaded successfully.')
        return binPath
    } catch (err) {
        console.error('❌ Error downloading yt-dlp binary:', err)
        return isWin ? 'yt-dlp.exe' : 'yt-dlp'
    }
}
