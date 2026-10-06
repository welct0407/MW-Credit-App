FROM node:24.19.0-bookworm-slim@sha256:e5a8dee7bc1e6a215d224a7ef8206f7e77271bc3cabd5febf2beafac0674f174
WORKDIR /app
COPY --chown=node:node bootstrap.mjs ./
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "bootstrap.mjs"]
