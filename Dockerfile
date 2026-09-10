FROM node:24-bookworm-slim

# Poppler provides pdftoppm for PDF-to-image conversion. ImageMagick with
# libheif provides the HEIC fallback used by the conversion service.
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils imagemagick libheif1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

ENV NODE_ENV=production
EXPOSE 10000
USER node

CMD ["node", "src/server.js"]
