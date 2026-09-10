import { useEffect, useState } from 'react';
import { OT_V13_ENABLED } from '../../lib/v13Flags';

export function IsolatedModeBanner() {
  const [isolated, setIsolated] = useState(false);

  useEffect(() => {
    if (!OT_V13_ENABLED) return;
    void fetch('/api/v13/status', { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<{ isolatedTestMode?: boolean }> : null)
      .then((status) => setIsolated(status?.isolatedTestMode === true))
      .catch(() => setIsolated(false));
  }, []);

  if (!OT_V13_ENABLED || !isolated) return null;
  return <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-amber-300 px-3 py-1 text-center text-[10px] font-black tracking-widest text-slate-950 shadow-sm">V1.3 ISOLATED TEST MODE · NO PRODUCTION V1.3 DATA</div>;
}
