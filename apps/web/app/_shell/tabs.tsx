import Link from 'next/link';

export interface TabLink {
  label: string;
  href: string;
  current: boolean;
  /** A count after the label, in muted figures. */
  count?: number;
}

/**
 * Links that switch a page between views, in the header nav's grammar: muted labels, the current
 * one in ink with the 2px accent underline, on a rule. Links, so they work without JavaScript and
 * keep their place on reload; they don't scroll the page.
 */
export function UnderlineTabs({
  label,
  items,
  className = '',
}: {
  /** Names the set for screen readers, e.g. "Their work". */
  label: string;
  items: TabLink[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`flex h-11 gap-6 border-b border-rule ${className}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.current ? 'page' : undefined}
          className={`focus-glow flex items-center gap-2 rounded-sm text-sm font-medium hover:text-accent ${
            item.current ? 'text-ink shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-muted'
          }`}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="font-normal text-muted tabular-nums">{item.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
