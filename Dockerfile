# AgentCore Runtime: ARM64, MCP served on 0.0.0.0:8000/mcp
FROM --platform=linux/arm64 node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npx tsc -p tsconfig.json --outDir dist --rootDir src --noEmit false

FROM --platform=linux/arm64 node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY web ./web
EXPOSE 8000
CMD ["node", "dist/main.js"]
