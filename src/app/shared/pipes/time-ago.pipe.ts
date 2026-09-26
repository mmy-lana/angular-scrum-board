import { Pipe, PipeTransform } from '@angular/core';

import { formatRelativeTime } from '../../core/utils/date-formatter';

/**
 * Renders an ISO-8601 timestamp as a short relative phrase.
 *
 * Pure and synchronous, so it is safe to use directly in a template without
 * the subscription cost of an observable pipe.
 */
@Pipe({
  name: 'timeAgo',
})
export class TimeAgoPipe implements PipeTransform {
  transform(isoTimestamp: string | null | undefined): string {
    return formatRelativeTime(isoTimestamp);
  }
}
