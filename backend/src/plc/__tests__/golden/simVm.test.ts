import { emitBytecode } from '../../bytecodeEmitter';
import { compileNetworksToIr } from '../../ldCompiler';
import { loadProgramFromBinary, NodePlcVm } from '../../simVm';

describe('NodePlcVm simulation', () => {
  test('executes simple LD/ST program', () => {
    const networks = [
      {
        id: 'n1',
        title: 't',
        description: '',
        rungs: [
          {
            id: 'r1',
            elements: [
              { id: '1', type: 'contactNO', tag: 'Start', address: '%I0.0' },
              { id: '2', type: 'coil', tag: 'Motor', address: '%Q0.0' },
            ],
          },
        ],
      },
    ] as any;

    const { ir, tags } = compileNetworksToIr(networks, []);
    const compiled = emitBytecode(ir, tags, 10);
    const { tags: loadedTags, bytecode } = loadProgramFromBinary(compiled.binary);
    const vm = new NodePlcVm();
    vm.loadProgram(loadedTags, bytecode);
    vm.setInput('%I0.0', true);
    expect(vm.executeScan()).toBe(true);
    expect(vm.readBit(1, 0, 0)).toBe(true);
  });
});
