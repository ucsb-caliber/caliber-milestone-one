FROM node:20-alpine

WORKDIR /app

# Copy frontend directory
COPY frontend ./frontend

# Install frontend dependencies (including dev for build)
WORKDIR /app/frontend
RUN npm install

# Build frontend
RUN npm run build

# Go back to root
WORKDIR /app

# Expose port
EXPOSE 8003

# Serve the built frontend with caching disabled so auth/UI updates apply immediately.
CMD ["sh", "-c", "npx -y http-server frontend/dist -p 8003 --gzip -c-1"]
