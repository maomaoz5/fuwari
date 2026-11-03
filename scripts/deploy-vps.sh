#!/usr/bin/env bash
# 发布脚本：本地构建 → 上传 → 同步 nginx 静态镜像 → 重启 → 回归验证
#
# 用法：
#   bash scripts/deploy-vps.sh            # 用现有 dist 发布
#   bash scripts/deploy-vps.sh --build    # 先 pnpm build 再发布
#
# 依赖：ssh（已配置 Host vps）、tar、pnpm（仅 --build 时需要）
# 说明：本地无需 rsync；服务器端用 rsync 把 dist 同步到 nginx 静态镜像目录。

set -euo pipefail

HOST="${DEPLOY_HOST:-vps}"
APP_DIR="/root/fuwari"
MIRROR="/opt/1panel/1panel/www/sites/zidayo.com/app-dist"
PM2_NAME="fuwari-blog"
SITE_URL="${SITE_URL:-https://www.zidayo.com}"

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

DO_BUILD=0
FORCE_CONTENT=0
for arg in "$@"; do
	case "$arg" in
		--build) DO_BUILD=1 ;;
		--force-content) FORCE_CONTENT=1 ;;
		-h|--help)
			echo "用法: bash scripts/deploy-vps.sh [--build] [--force-content]"
			echo "  --build         先执行 pnpm build"
			echo "  --force-content 用本地文章/摘要覆盖线上同名文件（默认保留线上较新的）"
			exit 0
			;;
		*) echo "未知参数: $arg（-h 查看帮助）" >&2; exit 2 ;;
	esac
done

if [[ $DO_BUILD -eq 1 ]]; then
	say "1/6 构建"
	pnpm build
fi

[[ -f dist/server/entry.mjs ]] || die "dist/server/entry.mjs 不存在，请先 pnpm build 或加 --build"

say "2/6 检查远端连通性"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "test -d '$APP_DIR'" \
	|| die "无法通过 ssh 连接到 $HOST 或 $APP_DIR 不存在"
ssh "$HOST" "test -d '$MIRROR' || mkdir -p '$MIRROR'"

say "3/6 上传 dist（原子切换）"
tar czf - -C dist . | ssh "$HOST" "
	set -e
	rm -rf '$APP_DIR/dist.new'
	mkdir -p '$APP_DIR/dist.new'
	tar xzf - -C '$APP_DIR/dist.new'
	rm -rf '$APP_DIR/dist.old'
	mv '$APP_DIR/dist' '$APP_DIR/dist.old'
	mv '$APP_DIR/dist.new' '$APP_DIR/dist'
"
echo "  dist 已替换"

say "4/6 上传文章 / AI 摘要"
# 默认 --ignore-existing：服务器上通过后台编辑过的文章、重新生成的摘要优先保留，
# 避免发布把线上运行态数据冲掉。需要强制覆盖时加 --force-content。
RSYNC_MODE="--ignore-existing"
if [[ "${FORCE_CONTENT:-0}" == "1" ]]; then
	RSYNC_MODE="--update"
	echo "  ⚠ 已启用 --force-content：本地版本会覆盖线上同名文件"
fi

tar czf - -C src/content posts | ssh "$HOST" "
	set -e
	rm -rf /tmp/fuwari-posts && mkdir -p /tmp/fuwari-posts
	tar xzf - -C /tmp/fuwari-posts
	rsync -a $RSYNC_MODE /tmp/fuwari-posts/posts/ '$APP_DIR/src/content/posts/'
	rm -rf /tmp/fuwari-posts
"
tar czf - -C public ai-summaries | ssh "$HOST" "
	set -e
	rm -rf /tmp/fuwari-ai && mkdir -p /tmp/fuwari-ai
	tar xzf - -C /tmp/fuwari-ai
	rsync -a $RSYNC_MODE /tmp/fuwari-ai/ai-summaries/ '$APP_DIR/public/ai-summaries/'
	rm -rf /tmp/fuwari-ai
"
echo "  文章与摘要已同步（默认不覆盖线上同名的较新文件）"
echo "  站点配置 data/config-overrides.json 归服务器所有，本次不上传"

say "5/6 同步 nginx 静态镜像并重启"
ssh "$HOST" "
	set -e
	rsync -a --delete '$APP_DIR/dist/' '$MIRROR/'
	chown -R 1panel:1panel '$MIRROR'
	pm2 start '$APP_DIR/ecosystem.config.cjs' --update-env >/dev/null
	sleep 2
	pm2 list | grep '$PM2_NAME'
"

say "6/6 回归验证"
# 应用接口走 Node 端口；静态资源必须走 nginx（/pagefind 不在 dist/client 内，Node 不提供）
node_code() { ssh "$HOST" "curl -s -o /dev/null -w '%{http_code}' '$1'"; }
edge_code() { ssh "$HOST" "curl -sk -o /dev/null -w '%{http_code}' --resolve www.zidayo.com:443:127.0.0.1 '$1'"; }
ASSET=$(ssh "$HOST" "curl -s http://127.0.0.1:4321/ | grep -o '/_astro/[^\"]*\.css' | head -1")

check() {
	local name="$1" got="$2" want="$3"
	if [[ "$got" == "$want" ]]; then
		printf '  ✓ %-18s %s\n' "$name" "$got"
	else
		printf '  ✗ %-18s %s (期望 %s)\n' "$name" "$got" "$want"
		return 1
	fi
}

fail=0
check "API 健康"   "$(node_code http://127.0.0.1:4321/api/__health/)"       200 || fail=1
check "数据库就绪" "$(node_code http://127.0.0.1:4321/api/__ready/)"        200 || fail=1
check "首页"       "$(node_code http://127.0.0.1:4321/)"                    200 || fail=1
check "后台 SPA"   "$(node_code http://127.0.0.1:4321/admin/index.html)"    200 || fail=1
check "未鉴权 API" "$(node_code http://127.0.0.1:4321/api/admin/posts/)"    401 || fail=1
check "首页 CSS"   "$(edge_code https://www.zidayo.com$ASSET)"              200 || fail=1
check "搜索索引"   "$(edge_code https://www.zidayo.com/pagefind/pagefind.js)" 200 || fail=1
check "文章页"     "$(edge_code https://www.zidayo.com/posts/why-astro/)"   200 || fail=1

if [[ $fail -eq 0 ]]; then
	say "发布完成 ✓  $SITE_URL"
	printf '  回滚：ssh %s "rm -rf %s/dist && mv %s/dist.old %s/dist && pm2 restart %s"\n' \
		"$HOST" "$APP_DIR" "$APP_DIR" "$APP_DIR" "$PM2_NAME"
else
	die "有检查项失败，请查看上面的输出；上一版仍在 $APP_DIR/dist.old"
fi
