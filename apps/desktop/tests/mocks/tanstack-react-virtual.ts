export function useVirtualizer() {
  return {
    getTotalSize: () => 0,
    getVirtualItems: () => [],
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  };
}
