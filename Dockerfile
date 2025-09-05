# Multi-stage Dockerfile for Helix Dashboard
# Stage 1: Build the frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build the frontend
RUN npm run build

# Stage 2: Build the backend (optimized for speed)
FROM rustlang/rust:nightly-alpine AS backend-builder

# Install build dependencies
RUN apk add --no-cache musl-dev pkgconfig openssl-dev openssl-libs-static

WORKDIR /app/backend

# Copy Cargo files first for better caching
COPY backend/Cargo.toml backend/Cargo.lock ./

# Create dummy src to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies in debug mode (much faster than release)
RUN cargo build
RUN rm src/main.rs

# Copy actual source code
COPY backend/src ./src

# Build the actual application in debug mode
RUN touch src/main.rs && cargo build

# Stage 3: Runtime image
FROM node:18-alpine AS runtime

# Install bash for the entrypoint script
RUN apk add --no-cache bash

WORKDIR /app

# Copy the built frontend from frontend-builder stage
COPY --from=frontend-builder /app/frontend/.next ./.next
COPY --from=frontend-builder /app/frontend/package*.json ./
COPY --from=frontend-builder /app/frontend/node_modules ./node_modules

# Copy public directory if it exists
RUN mkdir -p ./public

# Copy the built backend from backend-builder stage (debug build)
COPY --from=backend-builder /app/backend/target/debug/backend ./backend

# Copy the entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create helixdb-cfg directory for configuration files
RUN mkdir -p helixdb-cfg

# Expose ports
EXPOSE 3000 8080

# Set environment variables
ENV PORT=3000
ENV BACKEND_PORT=8080
ENV DOCKER_HOST_INTERNAL=host.docker.internal

# Start both services
CMD ["./docker-entrypoint.sh"]
