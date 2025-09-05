# Docker Setup for Helix Dashboard

This guide explains how to build and run the Helix Dashboard using Docker, which packages both the frontend and backend in a single container.

## Prerequisites

- Docker installed on your system
- Docker Compose (optional, for easier management)

## Building and Running

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up --build

# Run in detached mode (background)
docker-compose up --build -d

# Stop the container
docker-compose down
```

### Option 2: Using Docker directly

```bash
# Build the image
docker build -t helix-dashboard .

# Run the container
docker run -p 3000:3000 -p 8080:8080 --add-host=host.docker.internal:host-gateway --name helix-dashboard helix-dashboard

# Run in detached mode
docker run -d -p 3000:3000 -p 8080:8080 --add-host=host.docker.internal:host-gateway --name helix-dashboard helix-dashboard

# Stop the container
docker stop helix-dashboard
docker rm helix-dashboard
```

## Accessing the Application

Once the container is running:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080

## Configuration

### HelixDB Configuration Files

If you have local HelixDB configuration files, place them in a `helixdb-cfg` directory in the project root:

```
helix-dashboard/
├── helixdb-cfg/
│   ├── schema.hx
│   └── queries.hx
├── Dockerfile
└── docker-compose.yml
```

The Docker container will automatically mount this directory and make the configuration files available to the backend.

### Environment Variables

You can customize the application by setting environment variables:

```bash
# Using docker-compose
# Edit the docker-compose.yml file to add environment variables

# Using docker run
docker run -p 3000:3000 -p 8080:8080 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e BACKEND_PORT=8080 \
  -e DOCKER_HOST_INTERNAL=host.docker.internal \
  --name helix-dashboard helix-dashboard
```

## Development

For development, you may want to mount your source code as volumes:

```yaml
# Add to docker-compose.yml under the service
volumes:
  - ./frontend/src:/app/src:ro
  - ./backend/src:/app/backend/src:ro
  - ./helixdb-cfg:/app/helixdb-cfg:ro
```

## Troubleshooting

### Check container logs

```bash
# Using docker-compose
docker-compose logs

# Using docker
docker logs helix-dashboard
```

### Access container shell

```bash
# Using docker-compose
docker-compose exec helix-dashboard sh

# Using docker
docker exec -it helix-dashboard sh
```

### Common Issues

1. **Port conflicts**: Make sure ports 3000 and 8080 are not being used by other applications
2. **Build failures**: Ensure you have enough disk space and memory for the build process
3. **Configuration files**: Make sure your `helixdb-cfg` directory exists and contains the necessary files

## Architecture

The Docker setup uses a multi-stage build:

1. **Frontend Stage**: Builds the Next.js application
2. **Backend Stage**: Compiles the Rust backend
3. **Runtime Stage**: Combines both applications in a lightweight Node.js Alpine image

Both services run concurrently in the same container using a bash script that manages both processes.
