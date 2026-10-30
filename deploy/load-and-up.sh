#!/usr/bin/env bash
# 大福食刻 · Linux 服务器加载镜像并启动
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "缺 .env：先 cp .env.example .env 并修改密码与密钥"
    exit 1
fi

echo "1/4 校验并加载离线镜像..."
if [ -f images/SHA256SUMS.txt ]; then
    sha256sum -c images/SHA256SUMS.txt
fi
docker load -i images/dafu-images.tar

echo "2/4 启动五容器（mysql/redis/minio/backend/frontend；matting 走 profile）..."
docker compose up -d

echo "3/4 等待后端就绪并健康检查..."
for i in $(seq 1 30); do
    if curl -fsS -o /dev/null http://localhost:8095/api/health; then break; fi
    sleep 2
done
docker compose ps
curl -fsS -o /dev/null -w "frontend HTTP %{http_code}\n" http://localhost:8095/
# 封面自愈校验：后端启动时会把镜像内置封面补齐到 MinIO，这里验证一张种子封面可访问
curl -fsS -o /dev/null -w "cover HTTP %{http_code}\n" http://localhost:8095/img/cover/202610/e801c3913a0e517f.jpg

echo "4/4 完成。日志：docker compose logs -f backend"
