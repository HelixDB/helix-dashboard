# Dockerfile for Helix Dashboard (Next.js only)
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy frontend source
COPY frontend/ ./

# Build the application
RUN npm run build

# Production image
FROM node:18-alpine AS runtime

WORKDIR /app

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy public directory from project root and other necessary files
COPY public ./public
COPY --from=builder /app/next.config.* ./
COPY --from=builder /app/src ./src

# Create helixdb-cfg directory for configuration files
RUN mkdir -p helixdb-cfg

# Expose only the Next.js port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Start the Next.js application
CMD ["npm", "start"]
