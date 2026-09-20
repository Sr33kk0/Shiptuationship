export const PATH = {
  ship: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  doc: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  filter: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z",
  check: "M5 13l4 4L19 7",
  x: "M6 18L18 6M6 6l12 12",
  menu: "M4 6h16M4 12h16M4 18h16",
  chevR: "M9 5l7 7-7 7",
  chevD: "M19 9l-7 7-7-7",
  collapse: "M11 19l-7-7 7-7M19 19l-7-7 7-7",
  expand: "M13 5l7 7-7 7M5 5l7 7-7 7",
  search: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
  cal: "M8 2v4M16 2v4M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM3 10h18",
  clip: "M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13",
  up: "M5 10l7-7m0 0l7 7m-7-7v18",
  alert: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4m0 4h.01",
  refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  sortNone: "M8 9l4-4 4 4m0 6l-4 4-4-4",
  sortAsc: "M5 15l7-7 7 7",
  sortDesc: "M19 9l-7 7-7-7",
};

export function Icon({ d, size = 16, sw = 1.8 }: { d: keyof typeof PATH; size?: number; sw?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={PATH[d]} />
    </svg>
  );
}
