# Docker Setup for Helix Dashboard

This guide explains how to build and run the Helix Dashboard using Docker, which packages the Next.js application in a single container.

## Prerequisites

- Docker installed on your system
- Docker Compose (optional, for easier management)

## Building and Running

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and start the container
docker compose up --build

# Run in detached mode (background)
docker compose up --build -d

# Stop the container
docker compose down
```

### Option 2: Using Docker directly

```bash
# Build the image
docker build -t helix-dashboard .

# Run the container
docker run -p 3000:3000 --add-host=host.docker.internal:host-gateway --name helix-dashboard helix-dashboard

# Run in detached mode
docker run -d -p 3000:3000 --add-host=host.docker.internal:host-gateway --name helix-dashboard helix-dashboard

# Stop the container
docker stop helix-dashboard
docker rm helix-dashboard
```

## Accessing the Application

Once the container is running:

- **Application**: http://localhost:3000

## Configuration

The application connects to your HelixDB instance using environment variables from two sources:

### Environment Variables

**Docker environment (in docker-compose.yml):**
- `NODE_ENV=production` - Production mode for Next.js
- `PORT=3000` - Application port
- `DOCKER_HOST_INTERNAL=host.docker.internal` - For Docker networking

**HelixDB configuration (from frontend/.env file):**
- `HELIX_HOST` - HelixDB host (e.g., localhost)
- `HELIX_PORT` - HelixDB port (default: 6969)
- `HELIX_CLOUD_URL` - HelixDB cloud URL (for cloud deployments)
- `HELIX_API_KEY` - HelixDB API key (for cloud deployments)

### Setting up your .env file

Create a `.env` file in the `frontend` directory with your HelixDB configuration:

```bash
# frontend/.env

# For local HelixDB instance
HELIX_HOST=localhost
HELIX_PORT=6969
HELIX_CLOUD_URL=
HELIX_API_KEY=

# OR for cloud HelixDB instance
HELIX_HOST=
HELIX_PORT=
HELIX_CLOUD_URL=https://your-cloud-url.com
HELIX_API_KEY=your-api-key
```

### Changing HelixDB connection

To switch between different HelixDB instances:

1. **Edit your `frontend/.env` file** with new values
2. **Restart the container** (no rebuild needed):
   ```bash
   docker compose restart
   ```

### Using Docker run directly

If using `docker run` instead of docker-compose, you'll need to pass the environment variables manually:

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DOCKER_HOST_INTERNAL=host.docker.internal \
  -e HELIX_HOST=localhost \
  -e HELIX_PORT=6969 \
  -e HELIX_CLOUD_URL=https://xxxxxxxxxx.execute-api.us-west-1.amazonaws.com/v1 \
  -e HELIX_API_KEY=your-api-key \
  --add-host=host.docker.internal:host-gateway \
  --name helix-dashboard helix-dashboard
```

**Note:** Using docker-compose is recommended as it automatically reads from `frontend/.env`.

## Development

For development, you may want to mount your source code as volumes:

```yaml
# Add to docker-compose.yml under the service
volumes:
  - ./frontend/src:/app/src:ro
```

Note: For active development, it's recommended to run the application locally using `npm run dev` instead of Docker.

## Troubleshooting

### Check container logs

```bash
# Using docker-compose
docker compose logs

# Using docker
docker logs helix-dashboard
```

### Access container shell

```bash
# Using docker-compose
docker compose exec helix-dashboard sh

# Using docker
docker exec -it helix-dashboard sh
```

### Common Issues

1. **Port conflicts**: Make sure port 3000 is not being used by other applications
2. **Build failures**: Ensure you have enough disk space and memory for the build process
3. **HelixDB connection**: Make sure your HelixDB instance is running and accessible on the configured port (default: 6969)

## Architecture

The Docker setup uses a multi-stage build:

1. **Builder Stage**: Builds the Next.js application with all dependencies
2. **Runtime Stage**: Creates a lightweight production image with only the built application

The container runs a single Next.js application that includes both the frontend interface and API routes for connecting to HelixDB.
