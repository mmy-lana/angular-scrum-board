import { Injectable } from '@angular/core';
import Dexie from 'dexie';

import { db } from '../database/scrum-database';
import { Issue, RANKING_PRECISION_THRESHOLD, RANKING_STEP } from '../models/issue.model';

/** The resolved sort orders of the two cards bracketing a drop position. */
export interface NeighborOrders {
  readonly previous: number | null;
  readonly next: number | null;
}

/**
 * Raised when a drop target referenced a card that has since been moved or
 * deleted, so the intended position can no longer be resolved. Callers should
 * surface a retry prompt rather than guessing a position.
 */
export class StalePositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StalePositionError';
  }
}

/** Raised when a `*WithinTx` method is invoked outside a Dexie transaction. */
export class TransactionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionContractError';
  }
}

/**
 * Fractional-index ordering engine.
 *
 * Instead of renumbering a column on every drag, each card stores a numeric
 * `sortOrder` spaced {@link STEP} apart. Inserting between two neighbours
 * stores the midpoint, so a reorder writes exactly one record and never
 * conflicts with a concurrent edit elsewhere on the board.
 *
 * Repeatedly splitting the same gap eventually exhausts floating-point
 * precision; `needsRebalance` detects that state and a full column renumber is
 * performed inside the same transaction as the move that triggered it.
 */
@Injectable({ providedIn: 'root' })
export class RankingService {
  /** Base gap between consecutive cards in a freshly seeded column. */
  readonly STEP: number = RANKING_STEP;

  /** Minimum meaningful distance between two neighbouring sort orders. */
  readonly PRECISION_THRESHOLD: number = RANKING_PRECISION_THRESHOLD;

  /**
   * Computes the sort order for a card inserted between two neighbours.
   *
   * A `null` bound means the position is at the open end of the column.
   * The result is always strictly between the two supplied orders, so existing
   * cards never need to be rewritten.
   */
  calculateNewOrder(prevOrder: number | null, nextOrder: number | null): number {
    if (prevOrder === null && nextOrder === null) {
      return this.STEP;
    }

    if (prevOrder === null && nextOrder !== null) {
      return nextOrder / 2;
    }

    if (prevOrder !== null && nextOrder === null) {
      return prevOrder + this.STEP;
    }

    if (prevOrder !== null && nextOrder !== null) {
      return (prevOrder + nextOrder) / 2;
    }

    return this.STEP;
  }

  /**
   * Reports whether the gap between two neighbours has collapsed to the point
   * where a new order would be indistinguishable from its bounds.
   */
  needsRebalance(prevOrder: number | null, nextOrder: number | null): boolean {
    if (prevOrder === null || nextOrder === null) {
      return false;
    }

    return Math.abs(nextOrder - prevOrder) < this.PRECISION_THRESHOLD;
  }

  /**
   * Resolves the live neighbour orders for a drop position.
   *
   * `targetIssues` must be the current contents of the destination column
   * (excluding the card being moved), ordered by `sortOrder` and read inside
   * the caller's transaction. The caller supplies the stale orders it was
   * rendered with; this method maps them onto fresh data and refuses the
   * operation if the referenced predecessor no longer exists.
   *
   * @throws {StalePositionError} when the anchor card disappeared.
   */
  resolveNeighborOrders(
    targetIssues: readonly Issue[],
    prevOrder: number | null,
    nextOrder: number | null,
  ): NeighborOrders {
    const lastIssue = targetIssues[targetIssues.length - 1] ?? null;

    // Dropped into an empty column: no bounds to interpolate between.
    if (prevOrder === null && nextOrder === null) {
      return { previous: null, next: null };
    }

    // Dropped at the head: the head card is the lower bound.
    if (prevOrder === null) {
      const firstIssue = targetIssues[0] ?? null;
      return { previous: null, next: firstIssue === null ? null : firstIssue.sortOrder };
    }

    // Dropped at the tail: the tail card is the upper bound.
    if (nextOrder === null) {
      return { previous: lastIssue === null ? null : lastIssue.sortOrder, next: null };
    }

    // Dropped between two cards: locate the stale lower bound in fresh data.
    const anchorIndex = targetIssues.findIndex((issue) => issue.sortOrder === prevOrder);

    if (anchorIndex === -1) {
      throw new StalePositionError(
        'StalePositionError: Target issue reference disappeared. Please retry the move operation.',
      );
    }

    const anchor = targetIssues[anchorIndex];
    const following = targetIssues[anchorIndex + 1] ?? null;

    if (anchor === undefined) {
      throw new StalePositionError(
        'StalePositionError: Target issue reference disappeared. Please retry the move operation.',
      );
    }

    return {
      previous: anchor.sortOrder,
      next: following === null ? null : following.sortOrder,
    };
  }

  /**
   * Renumbers every card in a column onto clean {@link STEP} boundaries.
   *
   * Transaction contract: must be invoked from inside an active Dexie
   * transaction; the read-modify-write loop depends on the surrounding
   * transaction for isolation. Calling it standalone is rejected outright.
   */
  async rebalanceColumnWithinTx(statusId: string, sprintId: string | null): Promise<void> {
    this.assertTransactionContext(`rebalanceColumnWithinTx("${statusId}")`);

    const issues = await db.issues
      .where('statusId')
      .equals(statusId)
      .filter((issue) => issue.sprintId === sprintId)
      .sortBy('sortOrder');

    const now = new Date().toISOString();
    let currentStep = this.STEP;

    for (const issue of issues) {
      await db.issues.update(issue.id, {
        sortOrder: currentStep,
        version: issue.version + 1,
        updatedAt: now,
      });
      currentStep += this.STEP;
    }
  }

  /**
   * Guards the documented `*WithinTx` contract. Dexie exposes the active
   * transaction as a static; if it is unset, a standalone call would silently
   * run without the isolation its correctness depends on.
   */
  private assertTransactionContext(scope: string): void {
    if (Dexie.currentTransaction === null) {
      throw new TransactionContractError(
        `TransactionContractError: ${scope} must be executed within an active Dexie transaction.`,
      );
    }
  }
}
