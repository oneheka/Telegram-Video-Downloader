# 🚀 Telegram Video Downloader Bot

A feature-rich Telegram bot for automatically downloading and sending video content from 7 popular media platforms, built with **TypeScript**, **Node.js (`tsx`)**, **grammY**, and **Drizzle ORM** with a **PostgreSQL** database.

---

## 🌟 Supported Platforms

- 📸 **Instagram** (Reels / Posts / IGTV)
- 🎵 **TikTok**
- 🔴 **YouTube Shorts** (`youtube.com/shorts/...`)
- 🐦 **Twitter / X** (`twitter.com` / `x.com`)
- 🔵 **VK** (VK Clips and VK Video)
- 🤖 **Reddit** (`reddit.com` / `v.redd.it`)
- 📌 **Pinterest** (`pinterest.com` / `pin.it`)

---

## 🔥 Key Features

### ⚡ Automatic Link Recognition
The bot automatically detects and intercepts media links from personal chats and groups without requiring slash commands like `/download`.

### ♻️ Smart Duplicate Video Detection (Repost Warning)
- Stores group media history in the PostgreSQL `media_history` table.
- Media records are automatically retained for **7 days** and cleared via a background cron process.
- If a group member sends a link to a video that was previously downloaded:
  - The bot **does not re-download the file**, saving bandwidth and server resources.
  - The bot **replies directly to the original video message** with a notice: `♻️ @repeat_user, this video was already sent recently by first_author!`.
  - Automatically deletes the duplicate link message (when auto-delete is enabled).
  - Pings the user sending the duplicate with `@`, while mentioning the original sender as plain text to avoid redundant notifications.
  - If the original video message was deleted from the group, the bot clears the stale record and downloads the video fresh.

### 🌐 Multi-language Support (i18n) — 9 Languages
Auto-detection and manual language switching for 9 languages:
- 🇬🇧 **English** (`en`)
- 🇷🇺 **Русский** (`ru`)
- 🇰🇷 **한국어** (`ko`)
- 🇸🇦 **العربية** (`ar`)
- 🇨🇳 **中文** (`zh`)
- 🇰🇬 **Кыргызча** (`ky`)
- 🇰🇿 **Қазақша** (`kk`)
- 🇩🇪 **Deutsch** (`de`)
- 🇫🇷 **Français** (`fr`)

Language priority order: `Group Setting > User Setting > Telegram Account Language > Default Language`.

### ⚙️ Interactive Settings Menu (`/start` & `/settings`)
Inline keyboard menu with admin permission enforcement in group chats:
- 🌐 Language selection.
- 🗑 Auto-deletion of source link messages.
- 👤 Sender attribution toggle below videos.
- 📝 Video description toggle.
- ♻️ Repost duplicate warning toggle.

### 🎥 Clean Formatting & Safe HTML
- Header under videos: `@botusername | <a href="link">Open</a> | AuthorName`.
- All captions are rendered using safe `parse_mode: 'HTML'` with entity escaping.
- Automatic handling of Telegram's 1024-character caption limit (short descriptions stay under the video, while longer descriptions follow in a separate message).

---

## 🛠 Tech Stack

- **Runtime**: Node.js (`tsx`)
- **Bot Framework**: [grammY](https://grammy.dev/) + `@grammyjs/auto-retry`
- **Database**: PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)
- **Media Downloader**: `yt-dlp` (with automatic binary download & executable permission setup)

---

## 🚀 Quick Start & Installation

### 1. Clone the repository and install dependencies
```bash
git clone <repository_url>
cd Telegram_DWbot
npm install
```

### 2. Environment Variables (`.env`)
Copy the `.env.example` template to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Example `.env` content:
```env
BOT_TOKEN=your_telegram_bot_token_here
DATABASE_URL=postgres://username:password@localhost:5432/database_name
DEFAULT_LANGUAGE=en
```

### 3. Local Development & Testing
Run in development mode:
```bash
npm run dev
```

Run unit tests:
```bash
npm run test
```

---

## 🏭 Production Deployment (PM2)

Run directly using PM2:
```bash
pm2 start npm --name loaddrop -- run start
pm2 save
```
or:
```bash
pm2 start "npx tsx src/index.ts" --name loaddrop
pm2 save
```

---

## 📁 Project Structure

```
├── bin/                 # Auto-downloaded yt-dlp binary (in .gitignore)
├── src/
│   ├── config.ts        # Environment configuration and validation
│   ├── index.ts         # Main bot entrypoint
│   ├── db/              # Drizzle ORM schema and PostgreSQL queries
│   ├── downloader/      # yt-dlp execution engine and URL regex matchers
│   ├── handlers/        # Command, callback, and link handlers
│   ├── i18n/            # Localization middleware and resolver
│   └── locales/         # Translation JSON files (en, ru, ko, ar, zh, ky, kk, de, fr)
├── tests/               # Unit tests for link extractors and i18n
├── .env.example         # Environment template
├── .gitignore           # Git ignore rules
├── package.json
└── tsconfig.json
```