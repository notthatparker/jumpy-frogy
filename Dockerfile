FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npm", "start"]
