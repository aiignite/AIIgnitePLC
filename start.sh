#!/bin/bash

# AIIgnitePLC 后端快速启动脚本

set -e

echo "🚀 AIIgnitePLC Backend - 快速启动"
echo "=================================="

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

# 检查 docker-compose 是否可用
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ docker-compose 未安装，请先安装 docker-compose"
    exit 1
fi

# 使用 docker compose 或 docker-compose
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null; then
    COMPOSE_CMD="docker-compose"
fi

# 检查是否已有 .env 文件
if [ ! -f "backend/.env" ]; then
    echo "📝 创建 .env 文件..."
    cp backend/.env.example backend/.env
    echo "✅ .env 文件已创建"
fi

echo ""
echo "选择启动模式："
echo "1) Docker 模式（推荐） - 使用 docker-compose 启动所有服务"
echo "2) 本地开发模式 - 需要本地运行 PostgreSQL"
echo ""
read -p "请输入选项 (1 或 2): " choice

case $choice in
  1)
    echo ""
    echo "🐳 启动 Docker 模式..."
    $COMPOSE_CMD up -d

    echo ""
    echo "✅ 服务已启动！"
    echo ""
    echo "📡 服务地址："
    echo "   - 后端 API:  http://localhost:3310"
    echo "   - 健康检查:  http://localhost:3310/health"
    echo "   - PostgreSQL: localhost:5433"
    echo ""
    echo "💡 查看日志: $COMPOSE_CMD logs -f"
    echo "💡 停止服务: $COMPOSE_CMD down"
    echo "💡 重启服务: $COMPOSE_CMD restart"
    ;;
  2)
    echo ""
    echo "🔧 启动本地开发模式..."
    echo ""

    # 检查是否安装了 Node.js
    if ! command -v node &> /dev/null; then
      echo "❌ Node.js 未安装，请先安装 Node.js"
      exit 1
    fi

    # 进入后端目录
    cd backend

    # 安装依赖（如果需要）
    if [ ! -d "node_modules" ]; then
        echo "📦 安装依赖..."
        npm install
    fi

    # 创建 .env 文件（如果不存在）
    if [ ! -f ".env" ]; then
        cp .env.example .env
    fi

    echo ""
    echo "⚠️  请确保 PostgreSQL 已启动且创建了 aiignite_plc 数据库"
    echo ""
    read -p "是否已准备好？(y/n): " ready

    if [ "$ready" = "y" ] || [ "$ready" = "Y" ]; then
        echo ""
        echo "🏃 运行数据库迁移..."
        npm run db:migrate

        echo ""
        echo "🚀 启动开发服务器..."
        npm run dev
    else
        echo "请先准备好数据库后再运行此脚本"
        exit 1
    fi
    ;;
  *)
    echo "❌ 无效选项"
    exit 1
    ;;
esac
