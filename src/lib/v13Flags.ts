const viteEnvironment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export const OT_V13_ENABLED = viteEnvironment?.VITE_OT_V13_ENABLED === 'true';
