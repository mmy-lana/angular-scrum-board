import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';

import { ISSUE_PRIORITIES, IssuePriority, ISSUE_TYPES, IssueType } from '../models/issue.model';

/** Every shortcut the board recognises. */
export type ShortcutAction =
  | 'open-quick-create'
  | 'focus-search'
  | 'close-overlay'
  | 'set-priority-urgent'
  | 'set-priority-high'
  | 'set-priority-medium'
  | 'set-priority-low'
  | 'set-priority-lowest'
  | 'set-type-story'
  | 'set-type-bug'
  | 'set-type-task'
  | 'set-type-epic';

/** A resolved shortcut, ready to be dispatched. */
export interface ShortcutEvent {
  readonly action: ShortcutAction;
}

/**
 * Translates keystrokes into named board actions.
 *
 * Shortcuts are suppressed while the user is typing, so a plain `c` typed into
 * the search box never opens the create dialog. `Escape` is always delivered,
 * since dismissing an overlay must work regardless of what has focus.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutService {
  private readonly document = inject(DOCUMENT);
  private readonly events = new Subject<ShortcutEvent>();

  /** Emits every recognised shortcut. Tied to the service's lifetime. */
  readonly shortcuts$ = this.events.asObservable();

  constructor() {
    const handler = (event: KeyboardEvent): void => this.handleKeydown(event);

    this.document.addEventListener('keydown', handler);

    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('keydown', handler);
      this.events.complete();
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === 'Escape') {
      this.events.next({ action: 'close-overlay' });
      return;
    }

    // A single-key command is far too easy to trigger by accident from inside
    // a dialog, where the surrounding board is still in the DOM but should not
    // be receiving commands. Escape stays above this guard because it is the
    // one shortcut whose whole job is to dismiss the open overlay.
    if (this.hasOpenDialog()) {
      return;
    }

    if (isTypingTarget(event.target)) {
      return;
    }

    // `event.target` is the element the key was pressed on, which is not
    // necessarily the one holding focus. A shortcut pressed while a button or
    // select is focused would otherwise act on the board behind it.
    if (this.isInteractiveElementFocused()) {
      return;
    }

    const action = resolveAction(event.key);

    if (action !== null) {
      event.preventDefault();
      this.events.next({ action });
    }
  }

  /** True while any rendered dialog is open. */
  private hasOpenDialog(): boolean {
    return this.document.querySelector('[role="dialog"]') !== null;
  }

  private isInteractiveElementFocused(): boolean {
    const active = this.document.activeElement;

    if (active === null || !(active instanceof HTMLElement) || active === this.document.body) {
      return false;
    }

    return (
      active.isContentEditable ||
      ['input', 'textarea', 'select', 'button', 'a', 'option'].includes(
        active.tagName.toLowerCase(),
      )
    );
  }
}

/** True when the event originated inside an editable element. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

/** Maps a single unmodified key to a board action. */
function resolveAction(key: string): ShortcutAction | null {
  switch (key.toLowerCase()) {
    case 'c':
      return 'open-quick-create';
    case '/':
      return 'focus-search';
    case '1':
      return 'set-priority-urgent';
    case '2':
      return 'set-priority-high';
    case '3':
      return 'set-priority-medium';
    case '4':
      return 'set-priority-low';
    case '5':
      return 'set-priority-lowest';
    case 's':
      return 'set-type-story';
    case 'b':
      return 'set-type-bug';
    case 't':
      return 'set-type-task';
    case 'e':
      return 'set-type-epic';
    default:
      return null;
  }
}

/** The priority a number shortcut selects, urgent first. */
export function priorityForDigit(digit: number): IssuePriority | null {
  return [...ISSUE_PRIORITIES].reverse()[digit - 1] ?? null;
}

/** The type a letter shortcut selects. */
export function typeForLetter(letter: string): IssueType | null {
  return ISSUE_TYPES.find((type) => type === letter) ?? null;
}
