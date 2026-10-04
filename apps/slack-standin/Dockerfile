# Slack Stand-in (D12). No dependencies and no build: Node 24 runs the TypeScript sources directly.
FROM node:24-alpine
WORKDIR /app
COPY src ./src
ENV PORT=4010
EXPOSE 4010
USER node
CMD ["node", "src/main.ts"]
