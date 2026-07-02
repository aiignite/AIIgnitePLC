/**
 * Golden contract tests — compile output must match RH850 plc_download expectations
 */

import type { Network } from '../../../types';
import { emitBytecode, parseBinaryHeader } from '../../bytecodeEmitter';
import { compileNetworksToIr, countRungs } from '../../ldCompiler';
import { buildSfcBinary, compileSfcToIr } from '../../sfcParser';
import { compileStToIr } from '../../stParser';
import { PLC_MAGIC_AIPC, PlcMemClass, SfcProgram } from '../../types';

const motorLatchNetwork: Network[] = [
  {
    id: 'net1',
    title: 'Motor Latch',
    description: '',
    rungs: [
      {
        id: 'r1',
        elements: [
          { id: 'e1', type: 'contactNO', tag: 'Start_Btn', address: '%I0.0' },
          { id: 'e2', type: 'contactNO', tag: 'Latch', address: '%M0.0' },
          { id: 'e3', type: 'coil', tag: 'Motor', address: '%Q0.0' },
        ],
        hasBranch: true,
        branchElement: { id: 'e4', type: 'contactNC', tag: 'Stop_Btn', address: '%I0.1' },
      },
      {
        id: 'r2',
        elements: [
          { id: 'e5', type: 'contactNO', tag: 'Motor', address: '%Q0.0' },
          { id: 'e6', type: 'coil', tag: 'Latch', address: '%M0.0' },
        ],
      },
    ],
  },
];

describe('PLC golden compile contracts', () => {
  test('motor latch LD compiles valid AIPC binary', () => {
    const tags = [
      { id: '1', name: 'Start_Btn', address: '%I0.0', data_type: 'Bool' },
      { id: '2', name: 'Stop_Btn', address: '%I0.1', data_type: 'Bool' },
      { id: '3', name: 'Latch', address: '%M0.0', data_type: 'Bool' },
      { id: '4', name: 'Motor', address: '%Q0.0', data_type: 'Bool' },
    ];
    const { ir, tags: compiledTags } = compileNetworksToIr(motorLatchNetwork, tags);
    const result = emitBytecode(ir, compiledTags, 10, { rungCount: countRungs(motorLatchNetwork) });

    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.binary.length).toBeGreaterThan(20);

    const header = parseBinaryHeader(result.binary);
    expect(header.magic).toBe(PLC_MAGIC_AIPC);
    expect(header.tagCount).toBeGreaterThan(0);
    expect(header.codeSize).toBeGreaterThan(0);
    expect(header.crc32).not.toBe(0);
    expect(header.scanMs).toBe(10);

    const expectedSize = 20 + header.tagCount * 30 + header.codeSize;
    expect(result.binary.length).toBe(expectedSize);
  });

  test('ST motor assignment compiles', () => {
    const tagList = [
      {
        name: 'Motor_Coil',
        memClass: PlcMemClass.M,
        byteOffset: 0,
        bitOffset: 0,
        dataType: 0,
        retain: false,
      },
      {
        name: 'Start_Btn',
        memClass: PlcMemClass.I,
        byteOffset: 0,
        bitOffset: 0,
        dataType: 0,
        retain: false,
      },
      {
        name: 'Stop_Btn',
        memClass: PlcMemClass.I,
        byteOffset: 0,
        bitOffset: 1,
        dataType: 0,
        retain: false,
      },
    ];
    const ir = compileStToIr('Motor_Coil := Start_Btn AND NOT Stop_Btn;', tagList);
    const result = emitBytecode(ir, tagList, 10);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(result.bytecode.length).toBeGreaterThan(0);
  });

  test('SFC program produces IR and binary', () => {
    const sfc: SfcProgram = {
      initialStep: 'S0',
      steps: [
        {
          id: 'S0',
          actions: [{ type: 'N', address: '%Q0.0', value: true }],
        },
        { id: 'S1', actions: [{ type: 'N', address: '%Q0.1', value: true }] },
      ],
      transitions: [{ from: 'S0', to: 'S1', condition: '%I0.0' }],
    };
    const tags = [
      {
        name: 'Input',
        memClass: PlcMemClass.I,
        byteOffset: 0,
        bitOffset: 0,
        dataType: 0,
        retain: false,
      },
    ];
    const ir = compileSfcToIr(sfc, tags);
    const sfcBin = buildSfcBinary(sfc, tags);
    const result = emitBytecode(ir, tags, 10, { sfc });
    expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(sfcBin.binary.length).toBeGreaterThan(3);
  });

  test('parseAddress supports DB and byte areas', () => {
    const { parseAddress } = require('../../types');
    expect(parseAddress('%DB1.DBX0.0')?.memClass).toBe(3);
    expect(parseAddress('%MB0')?.byteOffset).toBe(0);
    expect(parseAddress('%IW2')?.memClass).toBe(0);
  });
});
