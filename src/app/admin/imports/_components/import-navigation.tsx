"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export type ImportAdminView =
  "candidates" | "batches" | "listings" | "credentials";

const views: readonly {
  readonly key: ImportAdminView;
  readonly label: string;
}[] = [
  { key: "candidates", label: "Pending candidates" },
  { key: "batches", label: "Batch history" },
  { key: "listings", label: "Published listings" },
  { key: "credentials", label: "Credentials" },
];

export function ImportNavigation({
  active,
  counts,
}: {
  readonly active: ImportAdminView;
  readonly counts: Readonly<Record<ImportAdminView, number>>;
}) {
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const navigation = navigationRef.current;
    const activeTab = navigation?.querySelector<HTMLElement>(
      'a[aria-current="page"]',
    );
    if (
      !navigation ||
      !activeTab ||
      navigation.scrollWidth <= navigation.clientWidth
    ) {
      return;
    }
    const navigationRect = navigation.getBoundingClientRect();
    const activeRect = activeTab.getBoundingClientRect();
    if (
      activeRect.left >= navigationRect.left &&
      activeRect.right <= navigationRect.right
    ) {
      return;
    }
    const centeredLeft =
      navigation.scrollLeft +
      activeRect.left -
      navigationRect.left -
      (navigationRect.width - activeRect.width) / 2;
    navigation.scrollTo({
      behavior: "auto",
      left: Math.max(0, centeredLeft),
    });
  }, [active]);

  return (
    <nav
      className="admin-import-tabs"
      aria-label="Listing import views"
      ref={navigationRef}
    >
      {views.map((view) => (
        <Link
          aria-current={active === view.key ? "page" : undefined}
          href={`/admin/imports?view=${view.key}`}
          key={view.key}
        >
          <span>{view.label}</span>
          <strong>{counts[view.key]}</strong>
        </Link>
      ))}
    </nav>
  );
}
