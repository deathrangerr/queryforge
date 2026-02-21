import { useState } from 'react';
import './SearchEverywhere.css';

export default function SearchEverywhere({ 
  schema, 
  functions, 
  views, 
  indexes, 
  sequences, 
  triggers,
  onClose,
  onSelect 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = (term) => {
    setSearchTerm(term);
    if (!term.trim()) {
      setResults([]);
      return;
    }

    const lowerTerm = term.toLowerCase();
    const allResults = [];

    // Search tables
    schema.forEach(table => {
      if (table.table_name.toLowerCase().includes(lowerTerm)) {
        allResults.push({
          type: 'Table',
          name: table.table_name,
          schema: table.table_schema,
          icon: '📋'
        });
      }
    });

    // Search views
    views.forEach(view => {
      if (view.table_name.toLowerCase().includes(lowerTerm)) {
        allResults.push({
          type: 'View',
          name: view.table_name,
          schema: view.table_schema,
          icon: '👁️'
        });
      }
    });

    // Search functions
    functions.forEach(func => {
      if (func.routine_name.toLowerCase().includes(lowerTerm)) {
        allResults.push({
          type: 'Function',
          name: func.routine_name,
          schema: func.routine_schema,
          icon: '⚡'
        });
      }
    });

    // Search indexes
    indexes.forEach(idx => {
      if (idx.indexname.toLowerCase().includes(lowerTerm)) {
        allResults.push({
          type: 'Index',
          name: idx.indexname,
          schema: idx.schemaname,
          icon: '🔍'
        });
      }
    });

    // Search sequences
    sequences.forEach(seq => {
      if (seq.sequence_name.toLowerCase().includes(lowerTerm)) {
        allResults.push({
          type: 'Sequence',
          name: seq.sequence_name,
          schema: seq.sequence_schema,
          icon: '🔢'
        });
      }
    });

    // Search triggers
    triggers.forEach(trig => {
      if (trig.trigger_name.toLowerCase().includes(lowerTerm)) {
        allResults.push({
          type: 'Trigger',
          name: trig.trigger_name,
          schema: trig.trigger_schema,
          icon: '⚙️'
        });
      }
    });

    setResults(allResults.slice(0, 100)); // Limit to 100 results
  };

  return (
    <div className="search-everywhere-overlay" onClick={onClose}>
      <div className="search-everywhere-dialog" onClick={e => e.stopPropagation()}>
        <div className="search-header">
          <input
            type="text"
            placeholder="Search everywhere... (Ctrl+Shift+F)"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            autoFocus
            className="search-input-large"
          />
          <button onClick={onClose} className="btn-close">✕</button>
        </div>
        <div className="search-results">
          {results.length === 0 && searchTerm && (
            <div className="empty-state">No results found for "{searchTerm}"</div>
          )}
          {results.length === 0 && !searchTerm && (
            <div className="empty-state">Type to search across all database objects</div>
          )}
          {results.map((result, i) => (
            <div
              key={i}
              className="search-result-item"
              onClick={() => {
                onSelect?.(result);
                onClose();
              }}
            >
              <span className="result-icon">{result.icon}</span>
              <div className="result-info">
                <div className="result-name">{result.name}</div>
                <div className="result-meta">
                  <span className="result-type">{result.type}</span>
                  <span className="result-schema">{result.schema}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {results.length > 0 && (
          <div className="search-footer">
            Found {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
