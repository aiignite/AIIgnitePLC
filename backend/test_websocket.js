const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3310/api/v1/ws?project=test-project-1');

let messageCount = 0;

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功');

  // 订阅地址
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      payload: {
        addresses: ['%I0.0', '%Q0.0', '%M0.0'],
      },
    })
  );
  console.log('📧 已订阅地址: %I0.0, %Q0.0, %M0.0');

  // 写入值 - 按下启动按钮
  setTimeout(() => {
    ws.send(
      JSON.stringify({
        type: 'write_value',
        payload: {
          address: '%I0.0',
          value: true,
        },
      })
    );
    console.log('✏️ 写入: %I0.0 = true (启动按钮)');
  }, 1000);

  // 再按停止按钮
  setTimeout(() => {
    ws.send(
      JSON.stringify({
        type: 'write_value',
        payload: {
          address: '%I0.1',
          value: true,
        },
      })
    );
    console.log('✏️ 写入: %I0.1 = true (停止按钮)');
  }, 3000);
});

ws.on('message', data => {
  const msg = JSON.parse(data);
  messageCount++;

  if (msg.type === 'connection_status') {
    console.log('📡 ' + msg.payload.status + ', projectId: ' + msg.payload.projectId);
  } else if (msg.type === 'batch_update') {
    console.log('📨 批量更新 (' + msg.payload.updates.length + ' 个):');
    msg.payload.updates.forEach(u => {
      console.log('   ' + u.address + ' = ' + u.value);
    });
  } else {
    console.log('📨 收到消息:', msg.type);
  }
});

ws.on('error', error => {
  console.error('❌ WebSocket 错误:', error.message);
  console.error('错误详情:', error);
  process.exit(1);
});

ws.on('close', () => {
  console.log('📡 WebSocket 连接关闭, 共收到 ' + messageCount + ' 条消息');
  process.exit(0);
});

setTimeout(() => {
  ws.close();
}, 6000);
