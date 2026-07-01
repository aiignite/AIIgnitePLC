import { ChatMessage, Network, ProjectNode, TagDefinition } from '../types';

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
              { id: 'fc1', name: 'Motor_Control [FC1]', type: 'block', color: 'text-purple-500' },
            ],
          },
          {
            id: 'tags',
            name: 'PLC 变量',
            type: 'folder',
            isOpen: true,
            children: [
              { id: 'tag_table', name: '默认变量表', type: 'tag', color: 'text-pink-500' },
            ],
          },
        ],
      },
      { id: 'common', name: '公共数据', type: 'folder', isOpen: false },
    ],
  },
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
          {
            id: 'e1',
            type: 'contactNO',
            tag: 'Start_Btn',
            address: '%I0.0',
            comment: '主启动按钮',
          },
          { id: 'e2', type: 'contactNC', tag: 'Stop_Btn', address: '%I0.1', comment: '急停' },
          { id: 'e3', type: 'coil', tag: 'Motor_Coil', address: '%Q0.0', comment: '主电机接触器' },
        ],
        hasBranch: true,
        branchElement: { id: 'e4', type: 'contactNO', tag: 'Motor_Coil', address: '%Q0.0' },
      },
    ],
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
              { name: 'ET', value: '' },
            ],
          },
          { id: 'e7', type: 'coil', tag: 'Timer_Done', address: '%M10.0' },
        ],
      },
    ],
  },
];

export const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 'm1',
    role: 'system',
    content:
      '我已经分析了程序段 1。如果在停止按钮失效的情况下，自锁逻辑可能存在安全风险。需要我详细解释吗？',
    actions: ['解释逻辑', '优化网络', '生成 SCL 代码'],
  },
  {
    id: 'm2',
    role: 'user',
    content: '请解释一下逻辑。',
  },
  {
    id: 'm3',
    role: 'system',
    content:
      "程序段 1 实现了一个标准的'自锁'电路。\n• Start_Btn (%I0.0) 启动电流流动。\n• Motor_Coil (%Q0.0) 与启动按钮并联，实现电路自锁。\n• Stop_Btn (%I0.1) 切断电路。",
  },
];

export const MOCK_TAGS: TagDefinition[] = [
  { id: 't1', name: 'Start_Btn', dataType: 'Bool', address: '%I0.0', comment: '启动按钮' },
  { id: 't2', name: 'Stop_Btn', dataType: 'Bool', address: '%I0.1', comment: '停止按钮' },
  { id: 't3', name: 'Motor_Coil', dataType: 'Bool', address: '%Q0.0', comment: '电机输出' },
  { id: 't4', name: 'Timer_Done', dataType: 'Bool', address: '%M10.0', comment: '计时完成标志' },
];
