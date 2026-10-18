import type { Board, Column, ColumnRole } from './types.ts';

/**
 * Move a card to `index` within `column` (index counts only that column's
 * cards). Card order lives in the flat `cards` array. Shared so the page's
 * optimistic move and the server's write can never disagree.
 */
export function applyMove(board: Board, id: string, column: string, index: number, today: string): void {
  const card = board.cards.find((c) => c.id === id);
  if (!card) throw new Error(`no card with id "${id}"`);
  if (!board.columns.some((c) => c.id === column)) throw new Error(`unknown column "${column}"`);
  board.cards.splice(board.cards.indexOf(card), 1);
  const target = board.cards.filter((c) => c.column === column);
  const at = Math.max(0, Math.min(Number.isFinite(index) ? index : target.length, target.length));
  if (card.column !== column) card.updated = today;
  card.column = column;
  if (at < target.length) {
    board.cards.splice(board.cards.indexOf(target[at]), 0, card);
  } else if (target.length > 0) {
    board.cards.splice(board.cards.indexOf(target[target.length - 1]) + 1, 0, card);
  } else {
    board.cards.push(card);
  }
}

/** The column carrying a role, if the board assigns it. */
export const columnWithRole = (board: Board, role: ColumnRole): Column | undefined =>
  board.columns.find((c) => c.role === role);

export const roleOf = (board: Board, columnId: string): ColumnRole | undefined =>
  board.columns.find((c) => c.id === columnId)?.role;
