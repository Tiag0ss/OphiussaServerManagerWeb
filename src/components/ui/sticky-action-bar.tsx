"use client";

/** Bottom padding to reserve on a page's content when it renders a StickyActionBar with content. */
export const STICKY_ACTION_BAR_CLEARANCE = "pb-20";

/**
 * A persistent action bar pinned to the bottom of the viewport (position:
 * fixed, offset past the desktop sidebar), separate from the top nav/tabs.
 * Renders nothing when there's no action for the current tab — the page
 * should only apply STICKY_ACTION_BAR_CLEARANCE while this has content.
 */
export function StickyActionBar({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 sm:px-6 md:left-[264px] lg:px-8">
      <div className="flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  );
}
