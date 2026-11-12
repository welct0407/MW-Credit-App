FROM node:24.21.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY services ./services
USER node
ENV PORT=8080
EXPOSE 8080
# No default command: every Cloud Run service sets command ["node"] and its entry point in args.
# R144 component versioning, last so earlier layers stay cached: the ecosystem release (Rnnn) and exact source
# commit this image was built for, reported by /health. Cloud Build passes both (cloudbuild-command.yaml for DEV,
# cloudbuild-business.yaml for PROD); a local or unlabelled build reports dev/unknown.
ARG MW_RELEASE_NUMBER=dev
ARG MW_SOURCE_COMMIT=unknown
ENV MW_RELEASE_NUMBER=$MW_RELEASE_NUMBER MW_SOURCE_COMMIT=$MW_SOURCE_COMMIT
