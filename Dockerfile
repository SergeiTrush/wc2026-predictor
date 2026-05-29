FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV DATA_DIR=/data

RUN mkdir -p /data

ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/index.js"]
