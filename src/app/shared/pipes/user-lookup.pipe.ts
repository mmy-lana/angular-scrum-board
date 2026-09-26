import { Pipe, PipeTransform } from '@angular/core';
import { liveQuery } from 'dexie';
import { Observable, of } from 'rxjs';

import { db } from '../../core/database/scrum-database';
import { User } from '../../core/models/user.model';

/**
 * Resolves a user id to the live {@link User} record.
 *
 * A pure pipe, so `transform` only runs when its input reference changes.
 * Streams are additionally memoised per id, which keeps a board of cards from
 * opening one IndexedDB query per change detection pass. The cache is bounded
 * by the number of participants in the database.
 *
 * `null` and blank ids resolve to `null` without touching the database, which
 * is the normal state for an unassigned issue. A missing id is likewise not an
 * error: it yields `null` so a card renders an initials placeholder rather
 * than tearing down the surrounding view.
 */
@Pipe({
  name: 'userLookup',
})
export class UserLookupPipe implements PipeTransform {
  private readonly cache = new Map<string, Observable<User | null>>();

  transform(userId: string | null | undefined): Observable<User | null> {
    if (userId === null || userId === undefined || userId.trim().length === 0) {
      return of(null);
    }

    const cached = this.cache.get(userId);

    if (cached !== undefined) {
      return cached;
    }

    const user$ = new Observable<User | null>((subscriber) => {
      const subscription = liveQuery(() => db.users.get(userId)).subscribe({
        next: (user) => {
          subscriber.next(user ?? null);
        },
        error: (error: unknown) => {
          // A lookup failure must not tear down a card that is otherwise
          // valid, so it degrades to "no avatar" rather than propagating.
          console.error(`[UserLookupPipe] Failed to resolve user "${userId}".`, error);
          subscriber.next(null);
          subscriber.complete();
        },
      });

      // `liveQuery` re-emits for the lifetime of the subscription; returning a
      // teardown is what releases the underlying IndexedDB cursor when the
      // consuming `async` pipe unsubscribes.
      return () => subscription.unsubscribe();
    });

    this.cache.set(userId, user$);

    return user$;
  }
}
