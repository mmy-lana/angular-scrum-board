import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import { User } from '../../../core/models/user.model';

/** Avatar sizing ramp. */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-6 min-h-6 w-6 min-w-6 text-[10px]',
  sm: 'h-8 min-h-8 w-8 min-w-8 text-xs',
  md: 'h-10 min-h-10 w-10 min-w-10 text-sm',
  lg: 'h-12 min-h-12 w-12 min-w-12 text-base',
};

const TEXT_SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

/**
 * Derives up to two uppercase initials from a display name.
 *
 * Returns the empty string when there is nothing to derive from, which lets
 * the caller decide on a placeholder rather than baking one in here.
 */
export function toInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return '';
  }

  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';

  return `${first}${second}`.toUpperCase();
}

/**
 * Participant avatar with a null-safe initials fallback.
 *
 * Falls back to initials whenever the user is missing, the avatar URL is
 * empty, or the image fails to load, so a card never renders a broken image.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl(); as url) {
      <img
        [src]="url"
        [alt]="altText()"
        [class]="imageClasses()"
        [attr.title]="user()?.name ?? null"
        loading="lazy"
        decoding="async"
        (error)="handleImageError()"
      />
    } @else {
      <span
        [class]="fallbackClasses()"
        [attr.title]="user()?.name ?? null"
        [attr.aria-label]="user()?.name ?? null"
        role="img"
      >
        {{ initials() }}
      </span>
    }
  `,
})
export class AvatarComponent {
  /** The participant to render. `null` is a supported, non-error state. */
  readonly user = input<User | null>(null);
  readonly size = input<AvatarSize>('md');
  /**
   * When true the avatar is decorative and exposes no accessible name, which
   * is correct for cards that already show the name in text.
   */
  readonly decorative = input(false);

  /** Set once an image load fails so the initials fallback takes over. */
  private readonly imageFailed = signal(false);

  constructor() {
    // A new user means a new image; clear the previous failure so the avatar
    // does not stay stuck on initials for the rest of the session.
    effect(() => {
      this.user()?.id;
      this.imageFailed.set(false);
    });
  }

  protected readonly imageUrl = computed<string | null>(() => {
    const url = this.user()?.avatarUrl;

    if (url === undefined || url.trim().length === 0 || this.imageFailed()) {
      return null;
    }

    return url;
  });

  protected readonly initials = computed<string>(() => {
    const user = this.user();
    return user === null ? '?' : toInitials(user.name) || '?';
  });

  protected readonly altText = computed<string>(() =>
    this.decorative() ? '' : (this.user()?.name ?? 'Unknown user'),
  );

  protected readonly imageClasses = computed<string>(
    () => `${this.baseClasses()} object-cover bg-slate-800`,
  );

  protected readonly fallbackClasses = computed<string>(
    () => `${this.baseClasses()} ${TEXT_SIZE_CLASSES[this.size()]} font-semibold uppercase`,
  );

  protected handleImageError(): void {
    this.imageFailed.set(true);
  }

  private baseClasses(): string {
    return `shrink-0 rounded-full ${SIZE_CLASSES[this.size()]}`;
  }
}
