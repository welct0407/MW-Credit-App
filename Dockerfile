FROM node:24.21.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY services ./services
USER node
ENV PORT=8080
EXPOSE 8080
# No default command: every Cloud Run service sets command ["node"] and its entry point in args.
