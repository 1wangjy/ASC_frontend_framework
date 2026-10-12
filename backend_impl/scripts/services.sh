#!/usr/bin/env bash
# 本机开发服务统一管理：日志写入仓库内 backend_impl/data/logs/（已 gitignore）。
#
# 为什么不用 /tmp：该环境下 /tmp 会被系统清理，导致 `nohup ... > /tmp/xxx.log` 重定向失败、
# 服务根本没起来（已踩两次）。仓库内目录不会被清，且 gitignore 已覆盖。
#
# 用法：
#   bash backend_impl/scripts/services.sh start|stop|restart|status [服务名...]
#   服务名：beimpl(3001) ai4sci(5001) modelapi(8100) frontend(3005)
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$REPO/backend_impl/data/logs"
mkdir -p "$LOG_DIR"

# name|port|工作目录|启动命令|健康路径|进程匹配 （用 | 分隔：命令里含 : 会破坏按 : 的切分）
SERVICES=(
  "beimpl|3001|$REPO/backend_impl|node src/index.js|/health|node src/index.js"
  "ai4sci|5001|$REPO/AI4Sci-NEXUS-ASC-Development-Domain/backend|.venv/bin/python run.py|/health|run.py"
  "modelapi|8100|$REPO/backend_impl/python/model_predict|.venv/bin/python -m uvicorn API.app:app --host 127.0.0.1 --port 8100|/health|uvicorn API.app:app"
  "frontend|3005|$REPO|VITE_NO_OPEN=1 node node_modules/.bin/vite --host|/|node_modules/.bin/vite"
)

health() { # port path -> http code（绕过本机代理；只输出一个码）
  local code
  code="$(curl -s --noproxy '*' -m 8 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1$2" 2>/dev/null)"
  printf '%s' "${code:-000}"
}

start_one() {
  local name="$1" port="$2" dir="$3" cmd="$4" hpath="$5" pattern="$6"
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "[$name] 已在运行（$(health "$port" "$hpath")）"
    return 0
  fi
  ( cd "$dir" && nohup bash -c "$cmd" > "$LOG_DIR/$name.log" 2>&1 & )
  echo "[$name] 启动中 → 日志 $LOG_DIR/$name.log"
}

stop_one() {
  local name="$1" pattern="$6"
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    pkill -f "$pattern" && echo "[$name] 已停止"
  else
    echo "[$name] 未运行"
  fi
}

status_one() {
  local name="$1" port="$2" hpath="$5"
  printf "%-9s %-5s %s\n" "$name" "$port" "$(health "$port" "$hpath")"
}

action="${1:-status}"; shift || true
selected=("$@")
want() { [ ${#selected[@]} -eq 0 ] && return 0; for s in "${selected[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }

case "$action" in
  start)
    for entry in "${SERVICES[@]}"; do IFS='|' read -r n p d c h pat <<<"$entry"; want "$n" && start_one "$n" "$p" "$d" "$c" "$h" "$pat"; done
    # 有界轮询直到就绪（uvicorn 要加载模型、vite 要预构建，25s 往往不够）
    echo "等待就绪（最多 90s）..."
    for _ in $(seq 1 18); do
      local pending=0
      for entry in "${SERVICES[@]}"; do
        IFS='|' read -r n p d c h pat <<<"$entry"
        want "$n" || continue
        [ "$(health "$p" "$h")" = "200" ] || pending=1
      done
      [ "$pending" -eq 0 ] && break
      sleep 5
    done
    for entry in "${SERVICES[@]}"; do IFS='|' read -r n p d c h pat <<<"$entry"; want "$n" && status_one "$n" "$p" "$d" "$c" "$h"; done
    ;;
  stop)
    for entry in "${SERVICES[@]}"; do IFS='|' read -r n p d c h pat <<<"$entry"; want "$n" && stop_one "$n" "$p" "$d" "$c" "$h" "$pat"; done
    ;;
  restart)
    for entry in "${SERVICES[@]}"; do IFS='|' read -r n p d c h pat <<<"$entry"; want "$n" && stop_one "$n" "$p" "$d" "$c" "$h" "$pat"; done
    sleep 3
    exec bash "${BASH_SOURCE[0]}" start "${selected[@]}"
    ;;
  status|*)
    printf "%-9s %-5s %s\n" "服务" "端口" "HTTP"
    for entry in "${SERVICES[@]}"; do IFS='|' read -r n p d c h pat <<<"$entry"; want "$n" && status_one "$n" "$p" "$d" "$c" "$h"; done
    echo "日志目录: $LOG_DIR"
    ;;
esac
