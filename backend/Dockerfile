# DAFU MOMENT 后端镜像：node:20-alpine
FROM node:20-alpine
WORKDIR /app

# 先装依赖以利用层缓存
COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com && npm cache clean --force

COPY src ./src
COPY sql ./sql
# 种子封面图（147 张，约 36MB）：启动时自愈补齐到 MinIO，避免新部署的图片全 404
COPY assets ./assets

ENV TZ=Asia/Shanghai
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/index.js"]
