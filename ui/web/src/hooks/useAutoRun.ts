import { useEffect, useRef } from "react";

type Runner = () => void;

export function useAutoRun(callback: Runner, deps: unknown[], delayMs = 500) {
  const timeoutRef = useRef<number>();

  useEffect(() => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      callback();
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
