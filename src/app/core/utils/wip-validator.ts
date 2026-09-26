/**
 * Derived work-in-progress state for a board column.
 *
 * A column is *at* its limit when the count equals the limit and *over* when it
 * exceeds it. Exceeding a limit is a warning rather than a hard block: the
 * board deliberately allows the drop and surfaces the violation visually.
 */
export interface ColumnWipStatus {
  /** Number of issues currently in the column. */
  readonly count: number;
  /** The configured limit, or `null` when the column is unlimited. */
  readonly limit: number | null;
  /** `true` when a limit exists and has been reached exactly. */
  readonly atLimit: boolean;
  /** `true` when a limit exists and has been exceeded. */
  readonly overLimit: boolean;
  /** Fraction of the limit consumed (0–1+), or `null` when unlimited. */
  readonly utilization: number | null;
  /** Remaining capacity, negative when over the limit, `null` when unlimited. */
  readonly remaining: number | null;
  /** Human-readable count such as `3/3` or `3`. */
  readonly label: string;
}

/**
 * Computes the WIP status of a column from its occupancy and limit.
 *
 * A `null` or non-positive limit means "unlimited". Non-positive limits are
 * treated as unlimited rather than as a hard zero-capacity block, because a
 * limit of `0` would otherwise make every column permanently and unusably
 * breached the moment a single card landed in it.
 */
export function computeWipStatus(count: number, limit: number | null): ColumnWipStatus {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  const isLimited = limit !== null && Number.isFinite(limit) && limit > 0;

  if (!isLimited) {
    return {
      count: safeCount,
      limit: null,
      atLimit: false,
      overLimit: false,
      utilization: null,
      remaining: null,
      label: `${safeCount}`,
    };
  }

  const effectiveLimit = Math.trunc(limit as number);
  const utilization = safeCount / effectiveLimit;

  return {
    count: safeCount,
    limit: effectiveLimit,
    atLimit: safeCount === effectiveLimit,
    overLimit: safeCount > effectiveLimit,
    utilization,
    remaining: effectiveLimit - safeCount,
    label: `${safeCount}/${effectiveLimit}`,
  };
}
