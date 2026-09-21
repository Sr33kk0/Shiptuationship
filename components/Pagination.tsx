import { PAGE_SIZES } from "@/lib/pagination";
import { Icon } from "./Icon";

export default function Pagination({ from, to, total, page, pages, limit, onPage, onLimit }: {
  from: number;
  to: number;
  total: number;
  page: number;
  pages: number;
  limit: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  if (!total) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="page-range">Showing {from}–{to} of {total}</span>
      <label className="page-limit">
        <span>Rows per page</span>
        <select value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size}>{size}</option>)}
        </select>
      </label>
      <span className="page-number">Page {page} of {pages}</span>
      <div className="page-buttons">
        <button onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page">
          <Icon d="chevL" size={15} sw={2.2} />
          <span>Previous</span>
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page === pages} aria-label="Next page">
          <span>Next</span>
          <Icon d="chevR" size={15} sw={2.2} />
        </button>
      </div>
    </nav>
  );
}
