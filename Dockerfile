# Imagem do app Node do bolao. Usa Debian slim (glibc) para o better-sqlite3
# aproveitar os binarios pre-compilados (no Alpine/musl ele tentaria compilar).
FROM node:22-slim

WORKDIR /app

# instala dependencias primeiro (cache de camada)
COPY package*.json ./
RUN npm ci --omit=dev

# copia o restante do projeto (data/seed.json incluso; .dockerignore tira o resto)
COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    BOLAO_DB=/data/bolao.db

EXPOSE 3000

# popular o banco (idempotente) e subir o servidor.
# O banco vive em /data (volume), entao persiste entre deploys.
CMD ["sh", "-c", "node scripts/seed.js && node src/server.js"]
