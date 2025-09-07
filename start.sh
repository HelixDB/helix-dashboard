#!/bin/bash

# Docker entrypoint script for Helix Dashboard
# This script starts both the backend and frontend services

set -e

echo "Starting Helix Dashboard..."

# Create log directory
mkdir -p /var/log

# Start the backend in the background
echo "Starting backend server on port 8080..."
./backend &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start the frontend (bind to 0.0.0.0 to be accessible from outside container)
echo "Starting frontend server on port 3000..."
cd /app
HOSTNAME=0.0.0.0 npm start &
FRONTEND_PID=$!

# Handle shutdown
cleanup() {
    echo "Shutting down services gracefully..."
    
    # Send SIGTERM first (graceful)
    kill -TERM $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    
    # Wait up to 30 seconds for graceful shutdown
    local timeout=30
    local count=0
    
    while [ $count -lt $timeout ]; do
        if ! kill -0 $BACKEND_PID 2>/dev/null && ! kill -0 $FRONTEND_PID 2>/dev/null; then
            echo "Services shut down gracefully"
            exit 0
        fi
        sleep 1
        count=$((count + 1))
    done
    
    # Force kill if still running
    echo "Force killing remaining services..."
    kill -KILL $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "Services stopped."
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Wait for both processes to keep container running
while kill -0 $BACKEND_PID 2>/dev/null && kill -0 $FRONTEND_PID 2>/dev/null; do
    sleep 5  # Check every 5 seconds, no spam
done

# One of the processes died
echo "One of the services stopped unexpectedly"
cleanup
