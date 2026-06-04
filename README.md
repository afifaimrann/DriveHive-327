<p align="center">
  <h1 align="center">🐝 DriveHive</h1>
  <p align="center">
    <strong>Unified Cloud Storage Aggregator with AI-Powered Document Intelligence</strong>
  </p>
  <p align="center">
    Pool multiple cloud storage accounts into a single seamless filesystem.<br/>
    Upload, download, and query your documents with built-in RAG-powered AI — all from one dashboard or a Telegram bot.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-ISC-blue" alt="License" />
</p>

---

## 📌 About This Repository

> **Note:** This project lives inside `327_Shadman_Learnings/ServerEnvironment/`. The repository was originally structured as part of coursework for **CSE 327 — Software Engineering**. What began as a learning exercise was progressively upscaled into a production-grade, full-stack cloud storage platform with AI capabilities. The surrounding repository structure reflects this academic origin.

---

## 🧩 What is DriveHive?

DriveHive is a **self-hosted cloud storage aggregation platform** that treats multiple cloud storage accounts (Google Drive, Dropbox) as a unified storage pool. It intelligently distributes file chunks across connected drives, reconstructs them on download, and layers an **AI-powered document Q&A system** (RAG) on top — enabling users to ask natural-language questions about their uploaded files.

### Key Differentiators

| Feature | Description |
|---|---|
| **Storage Pooling** | Combine 15 GB from Google Drive + 2 GB from Dropbox + N more accounts into one logical filesystem |
| **Automatic Chunking** | Files larger than 200 MB are split into chunks and distributed across drives based on available space |
| **Seamless Reconstruction** | Downloads re-assemble chunks from multiple providers transparently |
| **RAG Document Intelligence** | Upload a PDF, DOCX, or TXT — then ask questions about it using any LLM |
| **Telegram Bot** | Full file management and AI Q&A through a Telegram bot as a thin client |
| **Multi-Tenant** | Each user has isolated storage, credentials, and AI settings |

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│   React SPA     │────▶│   Express API    │────▶│   Supabase (Auth,    │
│   (Vite)        │     │   (Node.js)      │     │   PostgreSQL,        │
│                 │     │                  │     │   pgvector)          │
└─────────────────┘     │   Services:      │     └──────────────────────┘
                        │   ├─ Auth        │              │
┌─────────────────┐     │   ├─ OAuth       │     ┌────────┴─────────────┐
│  Telegram Bot   │────▶│   ├─ Storage     │     │   Cloud Providers    │
│  (thin client)  │     │   ├─ RAG         │     │   ├─ Google Drive    │
└─────────────────┘     │   └─ Telegram    │     │   └─ Dropbox         │
                        └──────────────────┘     └──────────────────────┘
```

### Backend (Express.js)

- **Authentication** — JWT-based auth with bcrypt password hashing, backed by Supabase user profiles
- **OAuth Service** — Handles Google & Dropbox OAuth 2.0 flows; tokens are AES-256-CBC encrypted at rest
- **Storage Service** — Provider-agnostic file operations via a factory pattern; smart chunk distribution based on available quota
- **RAG Service** — Full pipeline: text extraction (PDF, DOCX, TXT) → semantic chunking → vector embedding → cosine similarity retrieval → LLM answer generation
- **Telegram Service** — Full bot integration: `/upload`, `/download`, `/files`, `/ask` commands with inline keyboard navigation

### Frontend (React + Vite)

- **Dashboard** — Aggregated storage overview with donut chart visualization
- **File Browser** — Upload, download, delete files; RAG indexing status badges
- **Cloud Integration** — Connect/disconnect Google Drive, Dropbox, and Telegram Bot
- **RAG Chat** — Conversational AI interface with configurable LLM provider, collapsible settings panel, and source citations

### Database (Supabase + pgvector)

- **profiles** — User accounts, encrypted LLM API keys, embedding preferences
- **cloud_accounts** — Encrypted OAuth tokens for connected providers
- **files** — File metadata, MIME types, indexing status
- **file_chunks** — Chunk distribution records (which provider holds which piece)
- **document_chunks** — Text chunks + vector embeddings for RAG similarity search

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Runtime** | Node.js 22+, ES Modules |
| **Backend** | Express.js, Helmet, CORS, express-rate-limit |
| **Frontend** | React 19, Vite 8, React Router 7, Lucide Icons |
| **Database** | Supabase (PostgreSQL), pgvector extension |
| **AI/ML** | Xenova/Transformers.js (local embeddings), Google Generative AI SDK, OpenAI SDK |
| **Cloud APIs** | Google Drive API (googleapis), Dropbox SDK |
| **Bot** | node-telegram-bot-api |
| **Document Parsing** | pdf-parse, mammoth (DOCX) |
| **Security** | AES-256-CBC encryption, JWT, bcrypt, Joi validation |
| **Logging** | Pino + pino-pretty |
| **Testing** | Vitest |
| **Containerization** | Docker, Docker Compose |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 22.x
- **npm** ≥ 10.x
- A **Supabase** project (free tier works)
- **Google Cloud Console** project with Drive API enabled + OAuth 2.0 credentials
- **Dropbox App Console** app with OAuth 2.0 configured
- (Optional) **Telegram Bot** token from [@BotFather](https://t.me/BotFather)
- (Optional) **ngrok** for exposing localhost (required for OAuth callbacks in development)

### 1. Clone the Repository

```bash
git clone https://github.com/afifaimrann/DriveHive-327.git
cd DriveHive-327/327_Shadman_Learnings/ServerEnvironment
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in the values:

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `3000`) |
| `APP_URL` | Public URL for OAuth callbacks (e.g., your ngrok URL) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `JWT_SECRET` | Random string for signing JWTs |
| `ENCRYPTION_KEY` | 64-char hex key for AES-256 encryption. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `DROPBOX_CLIENT_ID` | Dropbox App Key |
| `DROPBOX_CLIENT_SECRET` | Dropbox App Secret |
| `TELEGRAM_BOT_TOKEN` | (Optional) Token from @BotFather |

### 3. Run the Supabase Migration

In your Supabase SQL Editor, run the contents of:

```
supabase_rag_migration.sql
```

This creates the `document_chunks` table with pgvector, the similarity search RPC function, and adds LLM settings columns to the `profiles` table.

> **Note:** Ensure the `vector` extension is enabled in your Supabase project (the migration handles this with `CREATE EXTENSION IF NOT EXISTS vector`).

### 4. Install Dependencies & Start

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..

# Build the client (production)
cd client && npm run build && cd ..

# Start the server
npm run dev
```

The server starts on `http://localhost:3000`. The React client (during development) runs separately on Vite's dev server — or serve the production build from the `client/dist` directory.

### 5. Configure OAuth Callback URLs

In your Google Cloud Console and Dropbox App Console, add these redirect URIs:

```
https://your-app-url.ngrok-free.app/api/oauth/callback/google
https://your-app-url.ngrok-free.app/api/oauth/callback/dropbox
```

Replace with your actual `APP_URL`.

---

## 🐳 Docker

### Quick Start with Docker Compose

```bash
cd 327_Shadman_Learnings/ServerEnvironment

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your actual values

# Build and start
docker compose up --build
```

The application will be available at `http://localhost:3000`.

### Build Only the Docker Image

```bash
docker build -t drivehive .
docker run --env-file .env -p 3000:3000 drivehive
```

---

## 📡 API Reference

All endpoints are prefixed with `/api`. Authentication is via `Authorization: Bearer <jwt_token>` header.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive JWT |
| `GET` | `/api/auth/me` | Get current user profile |

### Cloud Accounts (OAuth)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/oauth/connect/:provider` | Initiate OAuth flow (google/dropbox) |
| `GET` | `/api/oauth/callback/:provider` | OAuth callback handler |
| `GET` | `/api/oauth/accounts` | List connected cloud accounts |
| `DELETE` | `/api/oauth/accounts/:id` | Disconnect a cloud account |

### Storage

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/storage/quota` | Get aggregated storage quota |
| `GET` | `/api/storage/files` | List all uploaded files |
| `POST` | `/api/storage/upload` | Upload a file (multipart/form-data) |
| `GET` | `/api/storage/download/:fileId` | Download a file (reassembles chunks) |
| `DELETE` | `/api/storage/files/:fileId` | Delete a file and all its chunks |

### RAG (AI Document Q&A)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/rag/settings` | Get user's LLM/embedding configuration |
| `POST` | `/api/rag/settings` | Update LLM/embedding configuration |
| `POST` | `/api/rag/index/:fileId` | Manually index a file for RAG |
| `POST` | `/api/rag/query` | Ask a question over indexed documents |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Server health check |

---

## 🤖 Telegram Bot Commands

| Command | Description |
|---|---|
| `/start` | Link your Telegram account to DriveHive |
| `/files` | Browse and download your files |
| `/upload` | Upload a file to your storage pool |
| `/ask <question>` | Ask AI about your indexed documents |
| `/help` | Show available commands |

Send any document directly to the bot to upload it.

---

## 🧠 RAG Pipeline Deep Dive

The Retrieval-Augmented Generation pipeline works as follows:

```
Document Upload → Text Extraction → Semantic Chunking → Vector Embedding → Supabase pgvector
                                                                                    │
User Query → Query Embedding ──────────────────────────────────── Cosine Similarity ─┘
                                                                         │
                                                             Top-K Relevant Chunks
                                                                         │
                                                                    LLM Prompt ──→ Answer + Sources
```

### Supported LLM Providers

| Provider | Models | Notes |
|---|---|---|
| **Google Gemini** | gemini-1.5-flash, gemini-2.0-flash, etc. | Recommended; requires API key |
| **OpenRouter** | Any model on OpenRouter (free & paid) | Supports free models like gemma-2-9b |
| **OpenAI** | gpt-4o-mini, gpt-4o, etc. | Requires API key |
| **Ollama** | llama3, mistral, etc. | Fully local; no API key needed |
| **Custom** | Any OpenAI-compatible endpoint | For self-hosted or alternative APIs |

### Embedding Providers

| Provider | Model | Dimensions | Cost |
|---|---|---|---|
| **Local** | Xenova/all-MiniLM-L6-v2 | 384 | Free (runs in-process) |
| **Gemini** | text-embedding-004 | 768 | API-based |
| **OpenAI** | text-embedding-3-small | 1536 | API-based |

---

## 🔒 Security

- **OAuth tokens** are encrypted with AES-256-CBC before storage (never stored in plaintext)
- **LLM API keys** are encrypted at rest using the same encryption layer
- **Passwords** are hashed with bcrypt (12 rounds)
- **JWT tokens** expire after 24 hours
- **Rate limiting** is applied globally to prevent abuse
- **Helmet.js** sets secure HTTP headers
- **Row Level Security (RLS)** is enabled on all Supabase tables
- **Input validation** via Joi schemas on all API endpoints

---

## 📂 Project Structure

```
327_Shadman_Learnings/ServerEnvironment/
├── src/
│   ├── app.js                    # Express server entry point
│   ├── config/
│   │   ├── env.js                # Environment variable validation
│   │   └── supabase.js           # Supabase client initialization
│   ├── middleware/
│   │   ├── auth.middleware.js     # JWT authentication middleware
│   │   ├── error.middleware.js    # Global error handler
│   │   ├── rate-limit.js         # Rate limiter configuration
│   │   └── validation.js         # Joi validation middleware
│   ├── providers/
│   │   ├── base.js               # Abstract cloud provider interface
│   │   ├── google-drive.js       # Google Drive provider implementation
│   │   ├── dropbox.js            # Dropbox provider implementation
│   │   └── factory.js            # Provider factory pattern
│   ├── routes/
│   │   ├── auth.routes.js        # Authentication endpoints
│   │   ├── oauth.routes.js       # OAuth flow endpoints
│   │   ├── storage.routes.js     # File upload/download endpoints
│   │   ├── rag.routes.js         # RAG AI endpoints
│   │   └── health.routes.js      # Health check endpoint
│   ├── services/
│   │   ├── auth.service.js       # User registration & login logic
│   │   ├── crypto.service.js     # AES-256-CBC encryption/decryption
│   │   ├── file-chunker.js       # File splitting & reassembly
│   │   ├── oauth.service.js      # OAuth token management
│   │   ├── storage.service.js    # Unified storage operations
│   │   ├── rag.service.js        # RAG pipeline (extract, chunk, embed, query)
│   │   └── telegram.service.js   # Telegram bot command handlers
│   └── utils/
│       ├── errors.js             # Custom error classes
│       └── logger.js             # Pino logger configuration
├── client/                       # React frontend (Vite)
│   ├── src/
│   │   ├── pages/                # Dashboard, FileBrowser, Accounts, RagChat, Login, Register
│   │   ├── components/           # Layout, StorageChart, Toast, PrivateRoute
│   │   ├── context/              # Auth context provider
│   │   └── services/             # API client
│   └── ...
├── tests/                        # Vitest unit tests
├── supabase_rag_migration.sql    # Database migration script
├── Dockerfile                    # Docker container definition
├── docker-compose.yml            # Docker Compose orchestration
├── .env.example                  # Environment variable template
└── package.json                  # Server dependencies & scripts
```

---

## 🧪 Running Tests

```bash
npm test
```

Tests are powered by [Vitest](https://vitest.dev/) and can be run in watch mode:

```bash
npm run test:watch
```

---

## 📝 License

This project is licensed under the **ISC License**.

---

## 👤 Author

**Shadman Shahriar**

Built as part of CSE 327 — Software Engineering at North South University, and later evolved into a full-stack production-grade application.
