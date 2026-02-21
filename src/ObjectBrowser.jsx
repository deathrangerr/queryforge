import { useState, useEffect } from 'react';
import './ObjectBrowser.css';

export default function ObjectBrowser({
  connected,
  schema = [],
  schemas = [],
  functions = [],
  views = [],
  indexes = [],
  sequences = [],
  triggers = [],
  onTableSelect,
  onTableDoubleClick,
  onObjectSelect,
  onRefresh,
  darkMode
}) {
  const [objectType, setObjectType] = useState('schemas');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSchemas, setExpandedSchemas] = useState({});
  const [selectedSchema, setSelectedSchema] = useState('all');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [isMinimized, setIsMinimized] = useState(false);

  // Group objects by schema
  const groupBySchema = (items, nameKey = 'table_name', schemaKey = 'table_schema') => {
    const grouped = {};
    items.forEach(item => {
      const schemaName = item[schemaKey] || 'public';
      if (!grouped[schemaName]) grouped[schemaName] = [];
      grouped[schemaName].push(item);
    });
    return grouped;
  };

  // Filter ONLY tables (not views)
  const tables = schema.filter(s => s.table_type === 'BASE TABLE' || s.table_type === 'TABLE');
  // Views come from separate endpoint
  const viewsList = views;

  // Get all unique schemas - combine from schemas list and objects
  const allSchemas = new Set();
  
  // Add schemas from server
  schemas.forEach(s => allSchemas.add(s.schema_name));
  
  // Add schemas from objects (in case some have objects but aren't in schema list)
  [...tables, ...viewsList, ...functions, ...indexes, ...sequences, ...triggers].forEach(item => {
    const schemaName = item.table_schema || item.routine_schema || item.schemaname || item.sequence_schema || item.trigger_schema || 'public';
    allSchemas.add(schemaName);
  });
  
  const schemaList = Array.from(allSchemas).sort();

  // Filter by selected schema
  const filterBySchema = (items, schemaKey) => {
    if (selectedSchema === 'all') return items;
    return items.filter(item => (item[schemaKey] || 'public') === selectedSchema);
  };

  const filteredTables = filterBySchema(tables, 'table_schema');
  const filteredViews = filterBySchema(viewsList, 'table_schema');
  const filteredFunctions = filterBySchema(functions, 'routine_schema');
  const filteredIndexes = filterBySchema(indexes, 'schemaname');
  const filteredSequences = filterBySchema(sequences, 'sequence_schema');
  const filteredTriggers = filterBySchema(triggers, 'trigger_schema');

  const groupedTables = groupBySchema(filteredTables);
  const groupedViews = groupBySchema(filteredViews, 'table_name', 'table_schema');
  const groupedFunctions = groupBySchema(filteredFunctions, 'routine_name', 'routine_schema');
  const groupedIndexes = groupBySchema(filteredIndexes, 'indexname', 'schemaname');
  const groupedSequences = groupBySchema(filteredSequences, 'sequence_name', 'sequence_schema');
  const groupedTriggers = groupBySchema(filteredTriggers, 'trigger_name', 'trigger_schema');

  const toggleSchema = (schemaName) => {
    setExpandedSchemas(prev => ({
      ...prev,
      [schemaName]: !prev[schemaName]
    }));
  };

  const expandAll = () => {
    const expanded = {};
    schemaList.forEach(s => expanded[s] = true);
    setExpandedSchemas(expanded);
  };

  const collapseAll = () => {
    setExpandedSchemas({});
  };

  const toggleCategory = (schemaName, category) => {
    const key = `${schemaName}-${category}`;
    setExpandedCategories(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isCategoryExpanded = (schemaName, category) => {
    return expandedCategories[`${schemaName}-${category}`];
  };

  const renderSchemaView = () => {
    const filteredSchemas = searchTerm
      ? schemaList.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
      : schemaList;

    return filteredSchemas.map(schemaName => {
      const isExpanded = expandedSchemas[schemaName];
      const schemaTables = groupedTables[schemaName] || [];
      const schemaViews = groupedViews[schemaName] || [];
      const schemaFunctions = groupedFunctions[schemaName] || [];
      const schemaIndexes = groupedIndexes[schemaName] || [];
      const schemaSequences = groupedSequences[schemaName] || [];
      const schemaTriggers = groupedTriggers[schemaName] || [];

      const totalObjects = schemaTables.length + schemaViews.length + schemaFunctions.length + 
                          schemaIndexes.length + schemaSequences.length + schemaTriggers.length;

      return (
        <div key={schemaName} className="schema-group">
          <div className="schema-header" onClick={() => toggleSchema(schemaName)}>
            <span className="schema-icon">{isExpanded ? '▼' : '▶'}</span>
            <span className="schema-name">{schemaName}</span>
            <span className="schema-count">{totalObjects}</span>
          </div>
          {isExpanded && (
            <div className="schema-items">
              {schemaTables.length > 0 && (
                <div className="object-category">
                  <div 
                    className="category-header" 
                    onClick={() => toggleCategory(schemaName, 'tables')}
                  >
                    <span className="category-icon">{isCategoryExpanded(schemaName, 'tables') ? '▼' : '▶'}</span>
                    <span>📋 Tables</span>
                    <span className="category-count">{schemaTables.length}</span>
                  </div>
                  {isCategoryExpanded(schemaName, 'tables') && schemaTables.map((item, idx) => (
                    <div
                      key={idx}
                      className="object-item"
                      onClick={() => onTableSelect(item, schemaName, 'table')}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onTableDoubleClick) onTableDoubleClick(item, schemaName);
                      }}
                    >
                      <span className="object-name">{item.table_name}</span>
                    </div>
                  ))}
                </div>
              )}
              {schemaViews.length > 0 && (
                <div className="object-category">
                  <div 
                    className="category-header" 
                    onClick={() => toggleCategory(schemaName, 'views')}
                  >
                    <span className="category-icon">{isCategoryExpanded(schemaName, 'views') ? '▼' : '▶'}</span>
                    <span>👁️ Views</span>
                    <span className="category-count">{schemaViews.length}</span>
                  </div>
                  {isCategoryExpanded(schemaName, 'views') && schemaViews.map((item, idx) => (
                    <div key={idx} className="object-item" onClick={() => onObjectSelect(item, schemaName, 'view')}>
                      <span className="object-name">{item.table_name}</span>
                    </div>
                  ))}
                </div>
              )}
              {schemaFunctions.length > 0 && (
                <div className="object-category">
                  <div 
                    className="category-header" 
                    onClick={() => toggleCategory(schemaName, 'functions')}
                  >
                    <span className="category-icon">{isCategoryExpanded(schemaName, 'functions') ? '▼' : '▶'}</span>
                    <span>⚡ Functions</span>
                    <span className="category-count">{schemaFunctions.length}</span>
                  </div>
                  {isCategoryExpanded(schemaName, 'functions') && schemaFunctions.map((item, idx) => (
                    <div key={idx} className="object-item" onClick={() => onObjectSelect(item, schemaName, 'function')}>
                      <span className="object-name">{item.routine_name}</span>
                    </div>
                  ))}
                </div>
              )}
              {schemaIndexes.length > 0 && (
                <div className="object-category">
                  <div 
                    className="category-header" 
                    onClick={() => toggleCategory(schemaName, 'indexes')}
                  >
                    <span className="category-icon">{isCategoryExpanded(schemaName, 'indexes') ? '▼' : '▶'}</span>
                    <span>🔍 Indexes</span>
                    <span className="category-count">{schemaIndexes.length}</span>
                  </div>
                  {isCategoryExpanded(schemaName, 'indexes') && schemaIndexes.map((item, idx) => (
                    <div key={idx} className="object-item" onClick={() => onObjectSelect(item, schemaName, 'index')}>
                      <span className="object-name">{item.indexname}</span>
                    </div>
                  ))}
                </div>
              )}
              {schemaSequences.length > 0 && (
                <div className="object-category">
                  <div 
                    className="category-header" 
                    onClick={() => toggleCategory(schemaName, 'sequences')}
                  >
                    <span className="category-icon">{isCategoryExpanded(schemaName, 'sequences') ? '▼' : '▶'}</span>
                    <span>🔢 Sequences</span>
                    <span className="category-count">{schemaSequences.length}</span>
                  </div>
                  {isCategoryExpanded(schemaName, 'sequences') && schemaSequences.map((item, idx) => (
                    <div key={idx} className="object-item" onClick={() => onObjectSelect(item, schemaName, 'sequence')}>
                      <span className="object-name">{item.sequence_name}</span>
                    </div>
                  ))}
                </div>
              )}
              {schemaTriggers.length > 0 && (
                <div className="object-category">
                  <div 
                    className="category-header" 
                    onClick={() => toggleCategory(schemaName, 'triggers')}
                  >
                    <span className="category-icon">{isCategoryExpanded(schemaName, 'triggers') ? '▼' : '▶'}</span>
                    <span>⚙️ Triggers</span>
                    <span className="category-count">{schemaTriggers.length}</span>
                  </div>
                  {isCategoryExpanded(schemaName, 'triggers') && schemaTriggers.map((item, idx) => (
                    <div key={idx} className="object-item" onClick={() => onObjectSelect(item, schemaName, 'trigger')}>
                      <span className="object-name">{item.trigger_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  const renderObjectList = (grouped, nameKey, onSelect, objType) => {
    const schemas = Object.keys(grouped).sort();
    
    return schemas.map(schemaName => {
      const items = grouped[schemaName];
      const isExpanded = expandedSchemas[schemaName];
      const filteredItems = searchTerm
        ? items.filter(item => item[nameKey]?.toLowerCase().includes(searchTerm.toLowerCase()))
        : items;

      if (filteredItems.length === 0 && searchTerm) return null;

      return (
        <div key={schemaName} className="schema-group">
          <div className="schema-header" onClick={() => toggleSchema(schemaName)}>
            <span className="schema-icon">{isExpanded ? '📂' : '📁'}</span>
            <span className="schema-name">{schemaName}</span>
            <span className="schema-count">({filteredItems.length})</span>
          </div>
          {isExpanded && (
            <div className="schema-items">
              {filteredItems.map((item, idx) => (
                <div
                  key={idx}
                  className="object-item"
                  onClick={() => onSelect(item, schemaName, objType)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if ((objType === 'tables' || objType === 'table') && onTableDoubleClick) {
                      onTableDoubleClick(item, schemaName);
                    }
                  }}
                >
                  <span className="object-icon">{getObjectIcon(objectType)}</span>
                  <span className="object-name">{item[nameKey]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  const getObjectIcon = (type) => {
    const icons = {
      tables: '📋',
      views: '👁️',
      functions: '⚡',
      indexes: '🔍',
      sequences: '🔢',
      triggers: '⚙️'
    };
    return icons[type] || '📄';
  };

  const getObjectCount = () => {
    switch (objectType) {
      case 'schemas': return schemaList.length;
      case 'tables': return tables.length;
      case 'views': return viewsList.length;
      case 'functions': return functions.length;
      case 'indexes': return indexes.length;
      case 'sequences': return sequences.length;
      case 'triggers': return triggers.length;
      default: return 0;
    }
  };

  if (!connected) {
    return (
      <div className="object-browser empty">
        <div className="empty-state">
          <span className="empty-icon">🔌</span>
          <p>Not connected to database</p>
        </div>
      </div>
    );
  }

  return (
    <div className="object-browser">
      {/* Header */}
      <div className="browser-header">
        <h3>Database Objects</h3>
      </div>

      {/* Object Type Selector */}
      <div className="object-selector">
        <select 
          value={objectType} 
          onChange={(e) => setObjectType(e.target.value)}
          className="object-type-dropdown"
        >
          <option value="schemas">📁 Schemas (All Objects)</option>
          <option value="tables">📋 Tables Only</option>
          <option value="views">👁️ Views Only</option>
          <option value="functions">⚡ Functions Only</option>
          <option value="indexes">🔍 Indexes Only</option>
          <option value="sequences">🔢 Sequences Only</option>
          <option value="triggers">⚙️ Triggers Only</option>
        </select>
      </div>

      {/* Schema Filter */}
      {objectType !== 'schemas' && (
        <div className="schema-filter">
          <select 
            value={selectedSchema} 
            onChange={(e) => setSelectedSchema(e.target.value)}
            className="schema-filter-dropdown"
          >
            <option value="all">All Schemas ({schemaList.length})</option>
            {schemaList.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

          {/* Search Bar and Controls */}
          <div className="object-search">
            <input
              type="text"
              placeholder={`Search ${objectType}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button onClick={onRefresh} className="btn-refresh" title="Refresh Schema">
              🔄
            </button>
          </div>

          {/* Expand/Collapse Controls */}
          <div className="object-controls">
            <button onClick={expandAll} className="btn-control" title="Expand All">
              ⬇️ Expand All
            </button>
            <button onClick={collapseAll} className="btn-control" title="Collapse All">
              ⬆️ Collapse All
            </button>
          </div>

          {/* Object Count */}
          <div className="object-count">
            {getObjectCount()} {objectType}
          </div>

          {/* Object List */}
          <div className="object-list">
            {objectType === 'schemas' && renderSchemaView()}
            {objectType === 'tables' && renderObjectList(groupedTables, 'table_name', onTableSelect, 'table')}
            {objectType === 'views' && renderObjectList(groupedViews, 'table_name', onObjectSelect, 'view')}
            {objectType === 'functions' && renderObjectList(groupedFunctions, 'routine_name', onObjectSelect, 'function')}
            {objectType === 'indexes' && renderObjectList(groupedIndexes, 'indexname', onObjectSelect, 'index')}
            {objectType === 'sequences' && renderObjectList(groupedSequences, 'sequence_name', onObjectSelect, 'sequence')}
            {objectType === 'triggers' && renderObjectList(groupedTriggers, 'trigger_name', onObjectSelect, 'trigger')}
          </div>
    </div>
  );
}
