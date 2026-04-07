# ═══════════════════════════════════════════════════════════════
# Stage 1 — Build React frontend
# ═══════════════════════════════════════════════════════════════
FROM public.ecr.aws/docker/library/node:20-alpine AS frontend-build

WORKDIR /frontend

# Install deps first (layer cache — only re-runs when package.json changes)
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
# VITE_API_URL is intentionally empty — frontend and backend are
# served from the same origin, so all /api/* calls are relative
COPY frontend/ ./
RUN VITE_API_URL="" npm run build


# ═══════════════════════════════════════════════════════════════
# Stage 2 — Backend + bundled frontend
# ═══════════════════════════════════════════════════════════════
FROM public.ecr.aws/docker/library/node:20-alpine

WORKDIR /app

# Install production deps only
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source
COPY backend/ .

# Copy the compiled React app from Stage 1 into the path that
# index.js serves:  __dirname(src/) + ../../frontend/dist = /app/frontend/dist
COPY --from=frontend-build /frontend/dist ./frontend/dist

EXPOSE 3001

CMD ["npm", "start"]
