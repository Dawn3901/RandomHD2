# 基础镜像默认走 daocloud 镜像站：服务器直连 Docker Hub 不稳定。
# 本地网络能直连 Docker Hub 时（或 daocloud 不可用时）覆盖它：
#   docker compose build --build-arg NODE_IMAGE=node:22-bookworm-slim
# 两个来源拉到的镜像摘要相同，只是分发通道不同。
ARG NODE_IMAGE=m.daocloud.io/docker.io/library/node:22-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
# npm run build 内部会先执行 generate:data，从 assets/wiki 生成图标目录与战备数据
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=5173
ENV RANDOMHD2_STATE_FILE=/app/.randomhd2/sync-state.json

EXPOSE 5173

# 直接启动服务器，不要再跑 generate:data——镜像构建时（上面的 npm run build）
# 已经生成过图标目录、目录数据和 130 张缩略图，启动时重跑只会白读约 290MB 磁盘、
# 烧掉约 28 秒 CPU。HOST / PORT / RANDOMHD2_STATE_FILE 都从上面的 ENV 读取。
CMD ["node", "server/sync-server.mjs"]
