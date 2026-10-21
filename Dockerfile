# HealthMap API (Express + Sequelize). Built by the stack in deploy/docker-compose.yml.
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

# dependencies first (cached while only the code changes); argon2 has prebuilt binaries for this image
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# uploaded images live in a volume (see the compose file); the files in the repo are its first contents
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 5000
CMD ["node", "index.js"]
