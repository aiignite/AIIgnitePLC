
import { ProjectNode, Network, ChatMessage, TagDefinition } from '../types';

export const INITIAL_PROJECT_TREE: ProjectNode[] = [
  {
    id: 'p1',
    name: '项目1 (Project1)',
    type: 'root',
    isOpen: true,
    children: [
      {
        id: 'plc1',
        name: 'PLC_1 [CPU 1511-1 PN]',
        type: 'device',
        isOpen: true,
        children: [
          { id: 'dev_conf', name: '设备组态', type: 'config', color: 'text-yellow-600' },
          { id: 'online_diag', name: '在线和诊断', type: 'settings', color: 'text-green-600' },
          {
            id: 'blocks',
            name: '程序块',
            type: 'folder',
            isOpen: true,
            children: [
              { id: 'ob1', name: 'Main [OB1]', type: 'block', color: 'text-primary' },
              { id: 'graph1', name: 'Motor_Logic [Graph]', type: 'graph_block', color: 'text-blue-500' },
              { id: 'fc1', name: 'Motor_Control [FC1]', type: 'block', color: 'text-purple-500' }
            ]
          },
          {
            id: 'tags',
            name: 'PLC 变量',
            type: 'folder',
            isOpen: true,
            children: [
              { id: 'tag_table', name: '默认变量表', type: 'tag', color: 'text-pink-500' }
            ]
          }
        ]
      },
      { id: 'common', name: '公共数据', type: 'folder', isOpen: false }
    ]
  }
];

export const INITIAL_NETWORKS: Network[] = [
  {
    id: 'net1',
    title: '程序段 1: 电机启动逻辑',
    description: '// 简单的自锁启动/停止电路',
    rungs: [
      {
        id: 'rung1',
        elements: [
          { id: 'e1', type: 'contactNO', tag: 'Start_Btn', address: '%I0.0', comment: '主启动按钮' },
          { id: 'e2', type: 'contactNC', tag: 'Stop_Btn', address: '%I0.1', comment: '急停' },
          { id: 'e3', type: 'coil', tag: 'Motor_Coil', address: '%Q0.0', comment: '主电机接触器' },
        ],
        hasBranch: true,
        branchElement: { id: 'e4', type: 'contactNO', tag: 'Motor_Coil', address: '%Q0.0' }
      }
    ]
  },
  {
    id: 'net2',
    title: '程序段 2: 运行计时',
    description: '// 电机运行延时检测',
    rungs: [
      {
        id: 'rung2',
        elements: [
          { id: 'e5', type: 'contactNO', tag: 'Motor_Coil', address: '%Q0.0' },
          { 
            id: 'e6', 
            type: 'box_timer', 
            tag: 'IEC_Timer_0_DB', 
            address: 'TON',
            parameters: [
               { name: 'IN', value: '' },
               { name: 'Q', value: '' },
               { name: 'PT', value: 'T#5s' },
               { name: 'ET', value: '' }
            ]
          },
          { id: 'e7', type: 'coil', tag: 'Timer_Done', address: '%M10.0' },
        ]
      }
    ]
  }
];

export const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 'm1',
    role: 'system',
    content: "我注意到你添加了一个 PID 块。你想让我为你配置标准温度控制回路的参数吗？",
    actions: ['优化 PID', '解释参数', '生成调节脚本']
  },
  {
    id: 'm2',
    role: 'user',
    content: "是的，针对响应缓慢的情况进行优化，以减少超调。"
  },
  {
    id: 'm3',
    role: 'system',
    content: "基于'响应缓慢'，我建议增加积分作用时间 (Ti) 并减小比例增益 (Kp)。\n\nKp: 2.0 -> 0.8\nTi: 10s -> 25s",
    actions: ['应用更改']
  }
];

export const MOCK_TAGS: TagDefinition[] = [
  { id: 't1', name: 'Start_Btn', dataType: 'Bool', address: '%I0.0', comment: '启动按钮' },
  { id: 't2', name: 'Stop_Btn', dataType: 'Bool', address: '%I0.1', comment: '停止按钮' },
  { id: 't3', name: 'Motor_Coil', dataType: 'Bool', address: '%Q0.0', comment: '电机输出' },
  { id: 't4', name: 'Timer_Done', dataType: 'Bool', address: '%M10.0', comment: '计时完成标志' },
];
