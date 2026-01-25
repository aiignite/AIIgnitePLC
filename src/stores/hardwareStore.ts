import { create } from 'zustand';

export interface HardwareModule {
    slot: number;
    name: string;
    articleNumber: string;
    firmware: string;
    type: 'ps' | 'cpu' | 'io' | 'comm' | 'empty';
    image?: string;
    // Extended Properties
    ip?: string;
    subnet?: string;
    ioStart?: number;
    ioLength?: number;
    hwId?: number;
    comment?: string;
}

interface HardwareState {
    modules: HardwareModule[];
    isLoading: boolean;
    error: string | null;
    
    loadHardware: (projectId: string) => Promise<void>;
    updateModule: (projectId: string, slot: number, module: HardwareModule) => Promise<void>;
    deleteModule: (projectId: string, slot: number) => Promise<void>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3310/api/v1';

// Initial default modules if nothing is on server
const DEFAULT_MODULES: HardwareModule[] = [
    { slot: 1, name: 'PM 190W', articleNumber: '6EP1333-4BA00', firmware: '-', type: 'ps', hwId: 257 },
    { slot: 2, name: 'CPU 1511-1 PN', articleNumber: '6ES7 511-1AK02-0AB0', firmware: 'V2.9', type: 'cpu', ip: '192.168.0.1', subnet: '255.255.255.0', hwId: 64 },
    { slot: 3, name: 'DI 16x24VDC HF', articleNumber: '6ES7 521-1BH00-0AB0', firmware: 'V1.1', type: 'io', ioStart: 0, ioLength: 2, hwId: 263 },
    { slot: 4, name: 'DQ 16x24VDC/0.5A', articleNumber: '6ES7 522-1BH01-0AB0', firmware: 'V1.1', type: 'io', ioStart: 0, ioLength: 2, hwId: 264 },
    { slot: 5, name: 'AI 8xU/I/RTD/TC', articleNumber: '6ES7 531-7KF00-0AB0', firmware: 'V1.0', type: 'io', ioStart: 64, ioLength: 16, hwId: 265 },
];

export const useHardwareStore = create<HardwareState>((set, get) => ({
    modules: [],
    isLoading: false, 
    error: null,

    loadHardware: async (projectId: string) => {
        set({ isLoading: true });
        try {
            const res = await fetch(`${API_BASE}/projects/${projectId}/hardware`);
            if (res.ok) {
                const data = await res.json();
                
                if (data.length === 0) {
                     // Initial state if empty, optional: save defaults to server?
                     // For now just show defaults in UI
                     set({ modules: DEFAULT_MODULES, isLoading: false });
                     return;
                }

                // Map DB result to Frontend Model
                const mapped: HardwareModule[] = data.map((row: any) => ({
                    slot: row.slot,
                    name: row.name,
                    articleNumber: row.article_number,
                    firmware: row.firmware,
                    type: row.type,
                    hwId: row.hw_id,
                    ip: row.config?.ip,
                    subnet: row.config?.subnet,
                    ioStart: row.config?.ioStart,
                    ioLength: row.config?.ioLength
                }));
                set({ modules: mapped, isLoading: false });
            } else {
                 throw new Error('Failed to fetch hardware');
            }
        } catch (e: any) {
            console.error(e);
            set({ error: e.message, isLoading: false, modules: DEFAULT_MODULES }); // Fallback to defaults on error
        }
    },

    updateModule: async (projectId: string, slot: number, module: HardwareModule) => {
        // Optimistic Update
        set(state => ({
            modules: state.modules.some(m => m.slot === slot) 
                ? state.modules.map(m => m.slot === slot ? module : m)
                : [...state.modules, module]
        }));
        
        try {
            // Prepare payload
            const payload = {
                slot: module.slot,
                name: module.name,
                article_number: module.articleNumber || '',
                firmware: module.firmware || '',
                type: module.type,
                hw_id: module.hwId,
                config: {
                    ip: module.ip,
                    subnet: module.subnet,
                    ioStart: module.ioStart,
                    ioLength: module.ioLength
                }
            };
            
            await fetch(`${API_BASE}/projects/${projectId}/hardware/slot/${slot}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.error(e);
            // Revert on error? For now just log
        }
    },

    deleteModule: async (projectId: string, slot: number) => {
        set(state => ({
            modules: state.modules.filter(m => m.slot !== slot)
        }));

        try {
             await fetch(`${API_BASE}/projects/${projectId}/hardware/slot/${slot}`, {
                method: 'DELETE'
            });
        } catch (e) {
             console.error(e);
        }
    }
}));
