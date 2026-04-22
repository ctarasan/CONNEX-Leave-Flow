import { useCallback, useMemo, useState } from 'react';

let globalBusyCount = 0;

function setGlobalBusy(active: boolean) {
  if (typeof document === 'undefined') return;
  if (active) {
    globalBusyCount += 1;
  } else {
    globalBusyCount = Math.max(0, globalBusyCount - 1);
  }
  document.body.classList.toggle('app-busy', globalBusyCount > 0);
}

export function useAsyncAction() {
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});

  const runAction = useCallback(async <T,>(key: string, fn: () => Promise<T> | T): Promise<T | undefined> => {
    // Global mutex: when any async action is running, block new actions system-wide.
    if (globalBusyCount > 0 || busyMap[key]) return undefined;
    setBusyMap((prev) => ({ ...prev, [key]: true }));
    setGlobalBusy(true);
    try {
      return await Promise.resolve(fn());
    } finally {
      setBusyMap((prev) => ({ ...prev, [key]: false }));
      setGlobalBusy(false);
    }
  }, [busyMap]);

  const isActionBusy = useCallback((key: string) => busyMap[key] === true, [busyMap]);
  const anyBusy = useMemo(() => Object.values(busyMap).some(Boolean), [busyMap]);

  return { runAction, isActionBusy, anyBusy };
}

