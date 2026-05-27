FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/

RUN npm run install:all

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV DATA_DIR=/data

RUN mkdir -p /data

EXPOSE 3001

CMD ["node", "server/index.js"]
