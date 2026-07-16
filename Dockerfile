FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=5173
ENV RANDOMHD2_STATE_FILE=/app/.randomhd2/sync-state.json

EXPOSE 5173

CMD ["npm", "run", "sync", "--", "--host", "0.0.0.0", "--port", "5173"]
