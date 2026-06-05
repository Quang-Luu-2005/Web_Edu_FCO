FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY source/backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY source/backend ./

EXPOSE 8000

CMD ["npm", "start"]
