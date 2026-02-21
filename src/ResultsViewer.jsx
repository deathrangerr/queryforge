import { useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import './ResultsViewer.css';

export default function ResultsViewer({ 
  results, 
  onExport,
  onImport,
  darkMode,
  pendingTransaction = false,
  onCommit,
  onRollback
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterText, setFilterText] = useState('');

  if (!results || !results.rows) return null;

  const { rows, fields, rowCount, truncated, totalRows } = results;

  // Sorting
  const sortedRows = [...rows].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    if (aVal === bVal) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    const comparison = aVal < bVal ? -1 : 1;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Filtering
  const filteredRows = filterText
    ? sortedRows.filter(row =>
        Object.values(row).some(val =>
          String(val).toLowerCase().includes(filterText.toLowerCase())
        )
      )
    : sortedRows;

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const paginatedRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, `query_results_${Date.now()}.xlsx`);
    onExport?.('XLSX', filteredRows.length);
  };

  const exportToCSV = () => {
    const csv = Papa.unparse(filteredRows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${Date.now()}.csv`;
    a.click();
    onExport?.('CSV', filteredRows.length);
  };

  const exportToJSON = () => {
    const json = JSON.stringify(filteredRows, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${Date.now()}.json`;
    a.click();
    onExport?.('JSON', filteredRows.length);
  };

  const copyAsInsert = (tableName = 'table_name') => {
    const selectedRowsArray = Array.from(selectedRows).map(idx => filteredRows[idx]);
    const rowsToCopy = selectedRowsArray.length > 0 ? selectedRowsArray : filteredRows;
    
    const insertStatements = rowsToCopy.map(row => {
      const columns = fields.join(', ');
      const values = fields.map(field => {
        const val = row[field];
        if (val === null) return 'NULL';
        if (typeof val === 'number') return val;
        return `'${String(val).replace(/'/g, "''")}'`;
      }).join(', ');
      return `INSERT INTO ${tableName} (${columns}) VALUES (${values});`;
    }).join('\n');

    navigator.clipboard.writeText(insertStatements);
    alert(`Copied ${rowsToCopy.length} INSERT statements to clipboard`);
  };

  const toggleRowSelection = (index) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const selectAll = () => {
    if (selectedRows.size === filteredRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredRows.map((_, i) => i)));
    }
  };

  return (
    <div className="results-viewer">
      {pendingTransaction && (
        <div className="transaction-banner">
          <span className="transaction-icon">⚠️</span>
          <span className="transaction-text">Transaction in progress - Changes not committed</span>
          <div className="transaction-actions">
            <button onClick={onCommit} className="btn-commit">✓ Commit</button>
            <button onClick={onRollback} className="btn-rollback">✕ Rollback</button>
          </div>
        </div>
      )}
      <div className="results-toolbar">
        <div className="results-info">
          <span>📊 {rowCount} rows</span>
          {truncated && <span className="badge badge-warning">Showing {rows.length} of {totalRows}</span>}
          {selectedRows.size > 0 && <span className="badge badge-info">{selectedRows.size} selected</span>}
        </div>

        <div className="results-actions">
          <input
            type="text"
            placeholder="Filter results..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="filter-input"
          />

          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="page-size-select">
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={500}>500 rows</option>
            <option value={1000}>1000 rows</option>
            <option value={filteredRows.length}>All ({filteredRows.length} rows)</option>
          </select>

          <div className="export-menu">
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn-export">
              📥 Export ▼
            </button>
            {showExportMenu && (
              <div className="export-dropdown">
                <button onClick={exportToExcel} className="export-item">
                  <span>📊</span> Excel
                </button>
                <button onClick={exportToCSV} className="export-item">
                  <span>📄</span> CSV
                </button>
                <button onClick={exportToJSON} className="export-item">
                  <span>📋</span> JSON
                </button>
                <button onClick={() => {
                  const tableName = prompt('Enter table name:', 'table_name');
                  if (tableName) copyAsInsert(tableName);
                }} className="export-item">
                  <span>📝</span> Copy as INSERT
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th className="select-column">
                <input type="checkbox" onChange={selectAll} checked={selectedRows.size === filteredRows.length && filteredRows.length > 0} />
              </th>
              {fields.map(field => (
                <th key={field} onClick={() => handleSort(field)} className="sortable">
                  {field}
                  {sortColumn === field && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, rowIndex) => {
              const actualIndex = page * pageSize + rowIndex;
              return (
                <tr key={actualIndex} className={selectedRows.has(actualIndex) ? 'selected' : ''}>
                  <td className="select-column">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(actualIndex)}
                      onChange={() => toggleRowSelection(actualIndex)}
                    />
                  </td>
                  {fields.map(field => (
                    <td key={field}>
                      {row[field] === null ? <span className="null-value">NULL</span> : String(row[field])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setPage(0)} disabled={page === 0} className="btn-page">
            ⏮ First
          </button>
          <button onClick={() => setPage(page - 1)} disabled={page === 0} className="btn-page">
            ◀ Prev
          </button>
          <span className="page-info">
            Page {page + 1} of {totalPages} ({filteredRows.length} rows)
          </span>
          <button onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1} className="btn-page">
            Next ▶
          </button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="btn-page">
            Last ⏭
          </button>
        </div>
      )}
    </div>
  );
}
