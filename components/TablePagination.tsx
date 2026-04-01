import React, { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function useTablePagination<T>(items: T[], defaultPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = totalItems === 0 ? 0 : Math.min(page * pageSize, totalItems);

  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    totalItems,
    totalPages,
    rangeStart,
    rangeEnd,
    pagedItems,
  };
}

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}

const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  pageSize,
  totalItems,
  totalPages,
  rangeStart,
  rangeEnd,
  onPageChange,
  onPageSizeChange,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
      <p className="text-xs font-bold text-gray-500">
        แสดง {rangeStart}-{rangeEnd} จากทั้งหมด {totalItems} รายการ
      </p>
      <div className="flex items-center gap-2">
        <label className="text-xs font-bold text-gray-500">จำนวนต่อหน้า</label>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="px-2 py-1 border rounded-lg text-xs font-bold bg-white"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2 py-1 border rounded-lg text-xs font-bold disabled:opacity-40"
        >
          ก่อนหน้า
        </button>
        <span className="text-xs font-bold text-gray-600">
          หน้า {page}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1 border rounded-lg text-xs font-bold disabled:opacity-40"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
