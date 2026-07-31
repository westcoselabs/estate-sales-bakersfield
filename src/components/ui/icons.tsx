import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "list"
  | "plus"
  | "user"
  | "settings"
  | "chevron"
  | "logout"
  | "arrow"
  | "shield"
  | "calendar"
  | "photo"
  | "check"
  | "warning"
  | "clock"
  | "edit"
  | "status"
  | "estate"
  | "yard"
  | "search"
  | "map"
  | "pin"
  | "menu"
  | "close"
  | "pause"
  | "play"
  | "external"
  | "info"
  | "trash"
  | "mail";

type IconWeight = "regular" | "fill";

const house = (
  <>
    <path d="M3.75 10.5 12 3.75l8.25 6.75" />
    <path d="M5.5 9.75v10.5h13V9.75M9.25 20.25v-6.5h5.5v6.5" />
  </>
);

const paths: Record<IconName, ReactNode> = {
  home: house,
  estate: house,
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </>
  ),
  plus: <path d="M12 4.5v15M4.5 12h15" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.75 20.25c.65-4.1 3.05-6.15 7.25-6.15s6.6 2.05 7.25 6.15" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5" />
      <circle cx="12" cy="12" r="7.1" />
    </>
  ),
  chevron: <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />,
  logout: (
    <>
      <path d="m14 8 4 4-4 4M18 12H8" />
      <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" />
    </>
  ),
  arrow: <path d="M4.5 12h15M14.5 7l5 5-5 5" />,
  shield: (
    <>
      <path d="M12 21.25c5-2.1 7.5-5.4 7.5-9.9V5.6L12 2.75 4.5 5.6v5.75c0 4.5 2.5 7.8 7.5 9.9Z" />
      <path d="m8.75 12 2.1 2.1 4.4-4.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.25" width="17" height="15.25" rx="2.25" />
      <path d="M8 3.5v3.25M16 3.5v3.25M3.5 9.25h17" />
    </>
  ),
  photo: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2.25" />
      <circle cx="8.25" cy="8.75" r="1.5" />
      <path d="m4.25 17 4.75-4.5 3.25 3 2.5-2.25 5 4.75" />
    </>
  ),
  check: <path d="m5 12.25 4.2 4.2L19 6.75" />,
  warning: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.25v6.25M12 17.25h.01" />
    </>
  ),
  clock: (
    <>
      <path d="M4.5 7.25V3.75M4.5 3.75H8" />
      <path d="M4.8 4.2A9 9 0 1 1 3.25 15" />
      <path d="M12 7.25V12l3.25 2" />
    </>
  ),
  edit: (
    <>
      <path d="m14.6 5.15 4.25 4.25M5 19l2.9-.65L19.15 7.1a1.5 1.5 0 0 0 0-2.1L19 4.85a1.5 1.5 0 0 0-2.1 0L5.65 16.1 5 19Z" />
      <path d="m14.75 7 2.25 2.25" />
    </>
  ),
  status: (
    <>
      <path d="M6 3.75h12v16.5l-2-1.25-2 1.25L12 19l-2 1.25L8 19l-2 1.25V3.75Z" />
      <path d="M9 8h6M9 12h6M9 16h3.5" />
    </>
  ),
  yard: (
    <>
      <path d="M4 10.25h16v10H4v-10ZM3 10.25l1.5-5.5h15l1.5 5.5" />
      <path d="M7.5 10.25v-5.5M12 10.25v-5.5M16.5 10.25v-5.5M9 20.25v-5.5h6v5.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.75" cy="10.75" r="6.5" />
      <path d="m15.5 15.5 4.25 4.25" />
    </>
  ),
  map: (
    <>
      <path d="m3.75 5.5 5-2 6.5 2 5-2v15l-5 2-6.5-2-5 2v-15Z" />
      <path d="M8.75 3.5v15M15.25 5.5v15" />
    </>
  ),
  pin: (
    <>
      <path d="M19 10.25c0 5-7 11-7 11s-7-6-7-11a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10.25" r="2.25" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  pause: (
    <>
      <path d="M9 5.5v13" />
      <path d="M15 5.5v13" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7V5Z" />,
  external: (
    <>
      <path d="M13 4h7v7M20 4l-9 9" />
      <path d="M18.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5h5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.75v6M12 7.25h.01" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 3.75h5l1 3.25h-7l1-3.25Z" />
      <path d="m6.5 7 .75 13.25h9.5L17.5 7M10 10.5v6M14 10.5v6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
};

export function Icon({
  name,
  size = 22,
  weight = "regular",
  ...props
}: Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  readonly name: IconName;
  readonly size?: number;
  readonly weight?: IconWeight;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={weight === "fill" ? 2.2 : 1.8}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
