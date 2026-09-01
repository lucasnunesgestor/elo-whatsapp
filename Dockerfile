FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY mock-provider ./mock-provider

RUN mkdir -p data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/index.js"]
