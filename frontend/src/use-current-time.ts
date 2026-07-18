import { useEffect, useState } from 'react';

export function useCurrentTime(intervalMs: number = 30_000): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect((): (() => void) => {
    const timerId = window.setInterval((): void => {
      setNowMs(Date.now());
    }, intervalMs);

    return (): void => {
      window.clearInterval(timerId);
    };
  }, [intervalMs]);

  return nowMs;
}
