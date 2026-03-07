FROM node:20-alpine

WORKDIR /app

# Copy frontend directory
COPY frontend ./frontend

# Install frontend dependencies (including dev for build)
WORKDIR /app/frontend
RUN npm install

# Production build-time env for deployed path routing.
# These values are injected by Vite at build time and should not rely on a
# developer's local frontend/.env values.
ARG VITE_BASE_PATH=/caliber/
ARG VITE_API_BASE=/caliber
ARG VITE_OIDC_ISSUER=https://app.caliber.cs.ucsb.edu/auth/realms/platform
ARG VITE_OIDC_CLIENT_ID=portal
ARG VITE_OIDC_SCOPES=openid\ profile\ email
ENV VITE_BASE_PATH=${VITE_BASE_PATH} \
    VITE_API_BASE=${VITE_API_BASE} \
    VITE_OIDC_ISSUER=${VITE_OIDC_ISSUER} \
    VITE_OIDC_CLIENT_ID=${VITE_OIDC_CLIENT_ID} \
    VITE_OIDC_SCOPES=${VITE_OIDC_SCOPES}

# Build frontend
RUN npm run build

# Go back to root
WORKDIR /app

# Expose port
EXPOSE 8003

# Serve the built frontend with caching disabled so auth/UI updates apply immediately.
CMD ["sh", "-c", "npx -y http-server frontend/dist -p 8003 --gzip -c-1"]
