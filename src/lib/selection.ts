export const MAX_SET_STRATAGEMS = 4;

/**
 * 往组合里加一个战备。
 *
 * `allowDuplicate` 只对占位图标（任意红/蓝/绿色战备）为 true——「2 个任意红色战备」
 * 是有意义的；而同一个真实战备在游戏里不可能带两把，所以真实战备去重。
 */
export function addToSelection(current: string[], id: string, allowDuplicate = false): string[] {
  if (current.length >= MAX_SET_STRATAGEMS) return current;
  if (!allowDuplicate && current.includes(id)) return current;
  return [...current, id];
}

/** 按位置移除一项。同一 id 重复出现时只移除这一个，不会误删其他份 */
export function removeFromSelectionAt(current: string[], index: number): string[] {
  if (index < 0 || index >= current.length) return current;
  return current.filter((_, itemIndex) => itemIndex !== index);
}

export function selectionCount(current: string[], id: string): number {
  return current.filter((item) => item === id).length;
}
