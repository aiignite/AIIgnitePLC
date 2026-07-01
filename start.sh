#!/usr/bin/env bash

# AIIgnitePLC 本地开发启动脚本
# Frontend:  http://localhost:3300
# Backend:   http://localhost:3310

if [ -z "${BASH_VERSION:-}" ] || shopt -oq posix 2>/dev/null; then
    echo "请使用 bash 运行 start.sh，例如: bash ./start.sh 或 ./start.sh"
    exit 1
fi

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/.runtime-logs"
BACKEND_LOG="$LOG_DIR/backend-start.log"
FRONTEND_LOG="$LOG_DIR/frontend-start.log"
BACKEND_PID=""
FRONTEND_PID=""

FRONTEND_PORT=3300
BACKEND_PORT=3310

mkdir -p "$LOG_DIR"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Starting AIIgnitePLC Application${NC}"
echo -e "${BLUE}================================================${NC}"

if ! command -v node &>/dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi

if ! command -v npm &>/dev/null; then
    echo -e "${RED}❌ npm 未安装${NC}"
    exit 1
fi

show_log_tail() {
    local label=$1
    local log_file=$2

    if [ -f "$log_file" ]; then
        echo -e "${YELLOW}---- ${label} 最近日志 (${log_file}) ----${NC}"
        tail -n 40 "$log_file" || true
        echo -e "${YELLOW}----------------------------------------${NC}"
    else
        echo -e "${YELLOW}${label} 日志文件不存在: ${log_file}${NC}"
    fi
}

cleanup() {
    echo ""
    echo -e "${BLUE}Shutting down services...${NC}"
    kill "$BACKEND_PID" 2>/dev/null || true
    kill "$FRONTEND_PID" 2>/dev/null || true
    check_and_kill_port "$BACKEND_PORT" || true
    check_and_kill_port "$FRONTEND_PORT" || true
    echo -e "${GREEN}✓ All services stopped${NC}"
    exit 0
}

check_and_kill_port() {
    local port=$1
    local pids
    pids=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)

    if [ -n "$pids" ]; then
        echo -e "${YELLOW}⚠️  端口 ${port} 被占用，正在停止监听进程 (PID: ${pids})...${NC}"
        echo "$pids" | xargs kill 2>/dev/null || true

        for _ in {1..5}; do
            if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
                break
            fi
            sleep 1
        done

        if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  端口 ${port} 仍未释放，升级为强制停止...${NC}"
            echo "$pids" | xargs kill -9 2>/dev/null || true
            sleep 1
        fi

        if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
            echo -e "${RED}❌ 无法释放端口 ${port}${NC}"
            return 1
        fi

        echo -e "${GREEN}✓ 端口 ${port} 已释放${NC}"
    fi
}

ensure_env_files() {
    if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
        echo -e "${YELLOW}📝 创建 backend/.env ...${NC}"
        cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
    fi

    if [ ! -f "$SCRIPT_DIR/.env.local" ]; then
        echo -e "${YELLOW}📝 创建 .env.local ...${NC}"
        cat > "$SCRIPT_DIR/.env.local" <<EOF
VITE_API_BASE_URL=http://localhost:${BACKEND_PORT}/api/v1
EOF
    fi
}

install_if_needed() {
    local dir=$1
    local label=$2

    if [ ! -d "$dir/node_modules" ]; then
        echo -e "${YELLOW}📦 安装 ${label} 依赖...${NC}"
        (cd "$dir" && npm install)
    fi
}

echo -e "${BLUE}检查端口占用情况...${NC}"
check_and_kill_port "$BACKEND_PORT"
check_and_kill_port "$FRONTEND_PORT"

ensure_env_files
install_if_needed "$SCRIPT_DIR/backend" "Backend"
install_if_needed "$SCRIPT_DIR" "Frontend"

echo -e "${GREEN}Starting Backend on port ${BACKEND_PORT}...${NC}"
(
    cd "$SCRIPT_DIR/backend"
    npm run dev
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend started (PID: ${BACKEND_PID})${NC}"
echo -e "${BLUE}Backend log: ${BACKEND_LOG}${NC}"

echo "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s "http://localhost:${BACKEND_PORT}/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready${NC}"
        break
    fi

    if [ "$i" -eq 30 ]; then
        echo -e "${RED}❌ Backend did not respond in time${NC}"
        show_log_tail "Backend" "$BACKEND_LOG"
        kill "$BACKEND_PID" 2>/dev/null || true
        exit 1
    fi

    sleep 1
done

echo -e "${GREEN}Starting Frontend on port ${FRONTEND_PORT}...${NC}"
(
    cd "$SCRIPT_DIR"
    npm run dev
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓ Frontend started (PID: ${FRONTEND_PID})${NC}"
echo -e "${BLUE}Frontend log: ${FRONTEND_LOG}${NC}"

echo "Waiting for frontend to be ready..."
for i in {1..30}; do
    if curl -s "http://localhost:${FRONTEND_PORT}/" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Frontend is ready${NC}"
        break
    fi

    if [ "$i" -eq 30 ]; then
        echo -e "${RED}❌ Frontend did not respond in time${NC}"
        show_log_tail "Frontend" "$FRONTEND_LOG"
        kill "$BACKEND_PID" 2>/dev/null || true
        kill "$FRONTEND_PID" 2>/dev/null || true
        exit 1
    fi

    sleep 1
done

echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}✓ All services started successfully!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Frontend:     ${GREEN}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "Backend:      ${GREEN}http://localhost:${BACKEND_PORT}${NC}"
echo -e "Health Check: ${GREEN}http://localhost:${BACKEND_PORT}/health${NC}"
echo -e "Backend Log:  ${GREEN}${BACKEND_LOG}${NC}"
echo -e "Frontend Log: ${GREEN}${FRONTEND_LOG}${NC}"
echo ""
echo "Press Ctrl+C to stop all services..."
echo ""

trap cleanup SIGINT SIGTERM

wait
