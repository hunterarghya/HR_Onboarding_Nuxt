# Build stage
FROM node:20-alpine AS builder

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

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy the standalone build output from the builder stage
COPY --from=builder /app/.output ./.output

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Run the Nuxt production server
CMD ["node", ".output/server/index.mjs"]
