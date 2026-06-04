# ============================================
# DriveHive — Multi-stage Docker Build
# ============================================
# Stage 1: Build the React client
# Stage 2: Production server image
# ============================================

# --- Stage 1: Build React Client ---
FROM node:22-alpine AS client-builder

WORKDIR /app/client

# Install client dependencies first (better layer caching)
COPY client/package.json client/package-lock.json ./
RUN npm ci --ignore-scripts

# Copy client source and build
COPY client/ ./
RUN npm run build

# --- Stage 2: Production Server ---
FROM node:22-alpine

# Install system deps required by some npm packages (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install server dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Remove build tools after native modules are compiled
RUN apk del python3 make g++

# Copy server source code
COPY src/ ./src/
COPY supabase_rag_migration.sql ./

# Copy the built React client from Stage 1
COPY --from=client-builder /app/client/dist ./client/dist

# Create temp directories
RUN mkdir -p uploads downloads

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
CMD ["node", "src/app.js"]
