ARG NODE_IMAGE=node:24.19.0-bookworm-slim@sha256:e5a8dee7bc1e6a215d224a7ef8206f7e77271bc3cabd5febf2beafac0674f174
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional existing environment trust root for dependency downloads behind its approved proxy.
# BuildKit keeps this public CA mount out of image layers and runtime trust.
# Optional artifact cache contains only npm's integrity-checked public _cacache,
# never npmrc, logs or credentials. Bind mounting avoids adding it to image layers.
RUN --mount=type=secret,id=build-ca,required=false \
    --mount=type=bind,source=.build-cache,target=/build-cache,readonly \
    if [ -s /run/secrets/build-ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build-ca; fi; \
    if [ -s /build-cache/npm-cache.tar ]; then \
      mkdir /tmp/dependency-cache && tar -xf /build-cache/npm-cache.tar -C /tmp/dependency-cache && \
      npm ci --offline --cache /tmp/dependency-cache --ignore-scripts --no-audit --no-fund && \
      rm -rf /tmp/dependency-cache; \
    else npm ci --ignore-scripts --no-audit --no-fund; fi
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
