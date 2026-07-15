export function createLogger(scope: string) {
  return {
    info: (message: string, details?: Record<string, unknown>) => {
      console.log(`[${scope}] INFO: ${message}`, details ? JSON.stringify(details) : '');
    },
    error: (message: string, details?: Record<string, unknown>) => {
      console.error(`[${scope}] ERROR: ${message}`, details ? JSON.stringify(details) : '');
    },
  };
}
