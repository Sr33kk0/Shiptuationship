export const PAGE_SIZES = [25, 50, 100] as const;

export function paginate<T>(items: T[], requestedPage: number, limit: number) {
  const pages = Math.max(1, Math.ceil(items.length / limit));
  const page = Math.min(Math.max(1, requestedPage), pages);
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    page,
    pages,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + limit, items.length),
  };
}
