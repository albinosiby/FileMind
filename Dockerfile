FROM node:24-bookworm-slim

# Poppler provides pdftoppm for PDF-to-image conversion. ImageMagick with
# libheif provides the HEIC fallback used by the conversion service.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ghostscript imagemagick libheif1 poppler-utils \
    libreoffice-core-nogui libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
    tesseract-ocr tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

# Uploads and conversion results are temporary, but must be writable by the
# unprivileged application user at runtime.
RUN mkdir -p uploads outputs && chown -R node:node uploads outputs

ENV NODE_ENV=production
EXPOSE 10000
USER node

CMD ["node", "src/server.js"]
