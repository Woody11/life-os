FROM node:20-alpine

WORKDIR /app

# better-sqlite3 ships prebuilt binaries for most targets, but on alpine (musl)
# npm may need to compile from source. Install the build toolchain so `npm ci`
# never fails on a fresh image; these are cheap and stay in the final layer.
RUN apk add --no-cache python3 make g++

# Copy package manifests first and install so Docker can cache the dependency
# layer independently of source changes.
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci
RUN cd client && npm ci

# Copy the rest of the source and build the frontend into client/dist.
COPY . .
RUN cd client && npm run build

# Data directory for the SQLite file (DB_PATH=/data/lifeos.db). Mount a volume
# here to persist the database across container restarts.
RUN mkdir -p /data

ENV NODE_ENV=production
EXPOSE 3030
CMD ["node", "server/index.js"]
