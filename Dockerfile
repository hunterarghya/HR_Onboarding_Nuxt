# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package.json
COPY package*.json ./

# Install dependencies using npm as requested
RUN npm install

# Copy the rest of the application
COPY . .

# Build the Nuxt application
ENV NODE_OPTIONS="--max-old-space-size=8192"
RUN npm run build

# Production stage — use Debian-based image for full Chromium compatibility
FROM node:20-slim AS runner

WORKDIR /app

# Install chromium and required dependencies for whatsapp-web.js
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy the standalone build output from the builder stage
COPY --from=builder /app/.output ./.output

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=8192"
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Run the Nuxt production server
CMD ["node", ".output/server/index.mjs"]
