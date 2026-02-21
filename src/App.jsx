import { useState, useEffect } from 'react';
import './App.css';
import SQLEditor from './SQLEditor';
import ObjectBrowser from './ObjectBrowser';
import ObjectViewer from './ObjectViewer';
import ResultsViewer from './ResultsViewer';
import DBATools from './DBATools';
import SearchEverywhere from './SearchEverywhere';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Database Client';
const APP_SHORT_NAME = import.meta.env.VITE_APP_SHORT_NAME || 'DB Client';
const APP_LOGO = import.meta.env.VITE_APP_LOGO || '🗄️';
const INACTIVITY_TIMEOUT = parseInt(import.meta.env.VITE_INACTIVITY_TIMEOUT) || 5 * 60 * 1000;
const MAX_SESSION_AGE = parseInt(import.meta.env.VITE_MAX_SESSION_AGE) || 60 * 60 * 1000;
const APP_ENV = import.meta.env.VITE_APP_ENV || 'DEV'; // PROD, UAT, DEV

const Notification = ({ message, type, onClose }) => (
  <div className={`notification ${type}`}>
    <span>{type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'} {message}</span>
    <button onClick={onClose}>✕</button>
  </div>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState('sql');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState(false);
  const [schema, setSchema] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [tableColumns, setTableColumns] = useState([]);
  const [tableData, setTableData] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [queryHistory, setQueryHistory] = useState([]);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [schemaExpanded, setSchemaExpanded] = useState({});
  const [dbType, setDbType] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingQuery, setPendingQuery] = useState('');
  const [queryToExecute, setQueryToExecute] = useState('');
  const [sessionTimeout, setSessionTimeout] = useState(null);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : true; // Default to dark mode
  });
  const [notificationHistory, setNotificationHistory] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [progress, setProgress] = useState(0);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [showDestructiveConfirm, setShowDestructiveConfirm] = useState(false);
  const [destructiveQuery, setDestructiveQuery] = useState('');
  const [confirmDbName, setConfirmDbName] = useState('');
  const [queryRisk, setQueryRisk] = useState(null);
  
  // New state for enhanced features
  const [functions, setFunctions] = useState([]);
  const [views, setViews] = useState([]);
  const [indexes, setIndexes] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [explainResult, setExplainResult] = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);
  const [selectedObjectType, setSelectedObjectType] = useState(null);
  const [showObjectViewer, setShowObjectViewer] = useState(false);
  const [showSearchEverywhere, setShowSearchEverywhere] = useState(false);
  const [sqlEditorSize, setSqlEditorSize] = useState(''); // '', 'minimized', 'maximized'

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Shift+F for Search Everywhere
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        if (connected) setShowSearchEverywhere(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [connected]);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/user`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        setUser(user);
        if (user) startActivityMonitor();
      })
      .catch(() => setUser(null));
  }, []);

  // Activity monitor - reset on any user action
  const startActivityMonitor = () => {
    let inactivityTimer;
    
    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        addNotification('Session expired due to inactivity', 'error');
        handleLogout();
      }, INACTIVITY_TIMEOUT);
    };
    
    // Reset timer on any activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });
    
    resetTimer(); // Start timer
    
    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
      setConnected(false);
      setSchema([]);
      setResults(null);
      addNotification('Logged out successfully', 'info');
      window.location.href = '/';
    } catch (err) {
      addNotification('Logout failed', 'error');
    }
  };

  const exportToCSV = (data) => {
    if (!data || !data.rows || data.rows.length === 0) return;
    
    const headers = data.fields.join(',');
    const rows = data.rows.map(row => 
      data.fields.map(field => {
        const value = row[field];
        if (value === null) return 'NULL';
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    downloadFile(csv, 'query-results.csv', 'text/csv');
    
    // Log export activity
    fetch(`${API_URL}/api/log/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ format: 'CSV', rowCount: data.rows.length })
    }).catch(() => {});
  };

  const exportToJSON = (data) => {
    if (!data || !data.rows) return;
    const json = JSON.stringify(data.rows, null, 2);
    downloadFile(json, 'query-results.json', 'application/json');
    
    // Log export activity
    fetch(`${API_URL}/api/log/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ format: 'JSON', rowCount: data.rows.length })
    }).catch(() => {});
  };

  const exportToSQL = (data) => {
    if (!data || !data.rows || data.rows.length === 0) return;
    
    const tableName = selectedTable || 'results';
    const inserts = data.rows.map(row => {
      const columns = data.fields.join(', ');
      const values = data.fields.map(field => {
        const value = row[field];
        if (value === null) return 'NULL';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        return value;
      }).join(', ');
      return `INSERT INTO ${tableName} (${columns}) VALUES (${values});`;
    }).join('\n');
    
    downloadFile(inserts, 'query-results.sql', 'text/sql');
    
    // Log export activity
    fetch(`${API_URL}/api/log/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ format: 'SQL', rowCount: data.rows.length })
    }).catch(() => {});
  };

  const exportToHTML = (data) => {
    if (!data || !data.rows || data.rows.length === 0) return;
    
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Query Results</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Query Results</h1>
  <p>Total rows: ${data.rows.length}</p>
  <table>
    <thead>
      <tr>${data.fields.map(f => `<th>${f}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${data.rows.map(row => `<tr>${data.fields.map(f => `<td>${row[f] === null ? 'NULL' : row[f]}</td>`).join('')}</tr>`).join('\n      ')}
    </tbody>
  </table>
</body>
</html>`;
    
    downloadFile(html, 'query-results.html', 'text/html');
    
    // Log export activity
    fetch(`${API_URL}/api/log/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ format: 'HTML', rowCount: data.rows.length })
    }).catch(() => {});
  };

  const exportToXML = (data) => {
    if (!data || !data.rows || data.rows.length === 0) return;
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<results>
  ${data.rows.map(row => `
  <row>
    ${data.fields.map(field => `<${field}>${row[field] === null ? 'NULL' : escapeXml(String(row[field]))}</${field}>`).join('\n    ')}
  </row>`).join('')}
</results>`;
    
    downloadFile(xml, 'query-results.xml', 'text/xml');
    
    // Log export activity
    fetch(`${API_URL}/api/log/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ format: 'XML', rowCount: data.rows.length })
    }).catch(() => {});
  };

  const escapeXml = (str) => {
    return str.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case "'": return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  };

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addNotification(`Exported as ${filename}`, 'success');
    setShowExportMenu(false);
  };

  useEffect(() => {
    if (connected) loadSchema();
  }, [connected]);

  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setNotificationHistory(prev => [{message, type, time: new Date().toLocaleTimeString()}, ...prev.slice(0, 19)]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const loadSchema = async () => {
    setLoading(true);
    try {
      // Load tables and schemas
      const schemaRes = await fetch(`${API_URL}/api/db/schema`, {
        method: 'POST',
        credentials: 'include'
      });
      
      // Load all object types in parallel
      const [functionsRes, viewsRes, indexesRes, sequencesRes, triggersRes] = await Promise.all([
        fetch(`${API_URL}/api/db/functions`, { method: 'POST', credentials: 'include' }),
        fetch(`${API_URL}/api/db/views`, { method: 'POST', credentials: 'include' }),
        fetch(`${API_URL}/api/db/indexes`, { method: 'POST', credentials: 'include' }),
        fetch(`${API_URL}/api/db/sequences`, { method: 'POST', credentials: 'include' }),
        fetch(`${API_URL}/api/db/triggers`, { method: 'POST', credentials: 'include' })
      ]);
      
      if (schemaRes.ok) {
        const data = await schemaRes.json();
        setSchema(data.tables || []);
        setSchemas(data.schemas || []);
        
        // Load all object types
        if (functionsRes.ok) {
          const funcData = await functionsRes.json();
          setFunctions(funcData.functions || []);
        }
        if (viewsRes.ok) {
          const viewData = await viewsRes.json();
          setViews(viewData.views || []);
        }
        if (indexesRes.ok) {
          const idxData = await indexesRes.json();
          setIndexes(idxData.indexes || []);
        }
        if (sequencesRes.ok) {
          const seqData = await sequencesRes.json();
          setSequences(seqData.sequences || []);
        }
        if (triggersRes.ok) {
          const trigData = await triggersRes.json();
          setTriggers(trigData.triggers || []);
        }
        
        setSchemaLoaded(true);
        addNotification('Schema refreshed successfully', 'success');
      }
    } catch (err) {
      addNotification('Failed to load schema: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTableInfo = async (tableName, schemaName) => {
    setSelectedTable(tableName);
    setSelectedSchema(schemaName);
    setView('properties');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/table-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, schema: schemaName })
      });
      const data = await res.json();
      if (res.ok) {
        setTableColumns(data.columns || []);
      } else {
        addNotification(data.error, 'error');
      }
    } catch (err) {
      addNotification('Failed to load table info', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTableData = async (tableName, schemaName) => {
    setSelectedTable(tableName);
    setSelectedSchema(schemaName);
    setView('data');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/table-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableName, schema: schemaName, limit: 100 })
      });
      const data = await res.json();
      if (res.ok) {
        setTableData(data);
        addNotification(`Loaded ${data.rows.length} rows`, 'success');
      } else {
        addNotification(data.error, 'error');
      }
    } catch (err) {
      addNotification('Failed to load table data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.target);
    const connData = Object.fromEntries(form);
    try {
      const res = await fetch(`${API_URL}/api/db/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(connData)
      });
      const data = await res.json();
      if (res.ok) {
        setConnected(true);
        setConnectionInfo(connData);
        addNotification('Connected successfully', 'success');
      } else {
        addNotification(data.error, 'error');
      }
    } catch (err) {
      addNotification('Connection failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch(`${API_URL}/api/db/disconnect`, {
        method: 'POST',
        credentials: 'include'
      });
      setConnected(false);
      setSchema([]);
      setSelectedTable(null);
      setResults(null);
      setTableData(null);
      setConnectionInfo(null);
      addNotification('Disconnected', 'info');
    } catch (err) {
      addNotification('Disconnect failed', 'error');
    }
  };

  const analyzeQueryRisk = (queryText) => {
    const sql = queryText.trim().toUpperCase();
    const risks = [];
    let severity = 'low';

    // Destructive operations
    if (/^(DROP|TRUNCATE)\s/i.test(sql)) {
      risks.push('⚠️ DESTRUCTIVE: This will permanently delete data');
      severity = 'critical';
    }
    if (/^ALTER\s+TABLE/i.test(sql)) {
      risks.push('⚠️ SCHEMA CHANGE: This will modify table structure');
      severity = 'high';
    }
    if (/^DELETE\s+FROM/i.test(sql) && !/WHERE/i.test(sql)) {
      risks.push('⚠️ DELETE WITHOUT WHERE: All rows will be deleted');
      severity = 'critical';
    }
    if (/^UPDATE\s/i.test(sql) && !/WHERE/i.test(sql)) {
      risks.push('⚠️ UPDATE WITHOUT WHERE: All rows will be updated');
      severity = 'high';
    }

    // Full table scan warnings
    if (/^SELECT\s/i.test(sql) && !/WHERE/i.test(sql) && !/LIMIT/i.test(sql)) {
      risks.push('ℹ️ Full table scan (no WHERE clause)');
      severity = severity === 'low' ? 'medium' : severity;
    }

    // Lock warnings
    if (/^(UPDATE|DELETE|INSERT)\s/i.test(sql)) {
      risks.push('🔒 Will acquire write locks');
    }

    return risks.length > 0 ? { risks, severity } : null;
  };

  const isDestructiveQuery = (queryText) => {
    const sql = queryText.trim().toUpperCase();
    return /^(DROP|TRUNCATE|ALTER\s+TABLE)\s/i.test(sql) || 
           (/^DELETE\s+FROM/i.test(sql) && !/WHERE/i.test(sql));
  };

  const handleQuery = async (queryText) => {
    // If no query text provided, try to get from old state (backward compatibility)
    if (!queryText) {
      queryText = selectedText || query.trim();
    }
    
    if (!queryText || !queryText.trim()) {
      addNotification('Query cannot be empty', 'error');
      return;
    }

    // Read-only mode check
    if (readOnlyMode && /^(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE)\s/i.test(queryText.trim())) {
      addNotification('Cannot execute mutating queries in read-only mode', 'error');
      return;
    }

    // Analyze query risk
    const risk = analyzeQueryRisk(queryText);
    setQueryRisk(risk);

    // Check for destructive queries requiring confirmation
    if (isDestructiveQuery(queryText)) {
      setDestructiveQuery(queryText);
      setShowDestructiveConfirm(true);
      return;
    }
    
    // Check if it's a mutating query and show confirmation
    const isMutating = /^(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE)\s/i.test(queryText.trim());
    if (isMutating) {
      setPendingQuery(queryText);
      setShowConfirmDialog(true);
      return;
    }
    
    executeQuery(queryText);
  };

  const executeQuery = async (queryText) => {
    const controller = new AbortController();
    setAbortController(controller);
    setLoading(true);
    setProgress(10);
    try {
      setProgress(30);
      const res = await fetch(`${API_URL}/api/db/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: queryText }),
        signal: controller.signal
      });
      setProgress(60);
      const data = await res.json();
      setProgress(80);
      if (res.ok) {
        // Always set results, even for DDL statements
        if (!data.rows || data.rows.length === 0) {
          // For DDL/DML with no rows, create a result message
          const affectedRows = data.rowCount || 0;
          const queryType = queryText.trim().split(/\s+/)[0].toUpperCase();
          let message = '';
          
          if (queryType === 'DELETE') {
            message = `${affectedRows} row(s) deleted successfully.`;
          } else if (queryType === 'UPDATE') {
            message = `${affectedRows} row(s) updated successfully.`;
          } else if (queryType === 'INSERT') {
            message = `${affectedRows} row(s) inserted successfully.`;
          } else if (queryType === 'CREATE') {
            message = 'Object created successfully.';
          } else if (queryType === 'DROP') {
            message = 'Object dropped successfully.';
          } else if (queryType === 'ALTER') {
            message = 'Object altered successfully.';
          } else if (queryType === 'TRUNCATE') {
            message = 'Table truncated successfully.';
          } else {
            message = `Query executed successfully. ${affectedRows} row(s) affected.`;
          }
          
          setResults({
            rows: [{ Result: message }],
            fields: ['Result'],
            rowCount: affectedRows,
            truncated: false
          });
        } else {
          setResults(data);
        }
        setQueryHistory(prev => [{ query: queryText, timestamp: new Date(), rows: data.rowCount }, ...prev.slice(0, 19)]);
        if (data.isMutating) {
          setPendingTransaction(true);
          addNotification('Transaction started - Remember to commit or rollback', 'info');
        } else {
          addNotification(`Query executed: ${data.rowCount || 0} rows`, 'success');
        }
      } else {
        addNotification(data.error, 'error');
        setResults(null);
      }
      setProgress(100);
    } catch (err) {
      if (err.name === 'AbortError') {
        addNotification('Query cancelled', 'info');
      } else {
        addNotification('Query failed: ' + err.message, 'error');
      }
      setResults(null);
    } finally {
      setTimeout(() => setProgress(0), 500);
      setLoading(false);
      setAbortController(null);
      setShowConfirmDialog(false);
      setPendingQuery('');
    }
  };

  const cancelQuery = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const handleExplain = async (queryText) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: queryText })
      });
      const data = await res.json();
      if (res.ok) {
        setExplainResult(data.plan);
        setView('explain');
        addNotification('Execution plan generated', 'success');
      } else {
        addNotification(data.error, 'error');
      }
    } catch (err) {
      addNotification('EXPLAIN failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Log file upload
    fetch(`${API_URL}/api/log/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fileName: file.name, fileSize: file.size })
    }).catch(() => {});
    
    const text = await file.text();
    const queries = text.split(';').filter(q => q.trim());
    
    if (queries.length === 0) {
      addNotification('No valid queries found in file', 'error');
      return;
    }
    
    const mutatingCount = queries.filter(q => /^(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE)\s/i.test(q.trim())).length;
    
    if (mutatingCount > 0) {
      if (!confirm(`This file contains ${mutatingCount} mutating queries out of ${queries.length} total queries.\n\nAre you sure you want to execute all of them?`)) {
        return;
      }
    }
    
    setQuery(text);
    addNotification(`Loaded ${queries.length} queries from file`, 'success');
  };

  const handleCommit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/commit`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        setPendingTransaction(false);
        addNotification('Transaction committed', 'success');
      } else {
        const data = await res.json();
        addNotification(data.error, 'error');
      }
    } catch (err) {
      addNotification('Commit failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/rollback`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        setPendingTransaction(false);
        addNotification('Transaction rolled back', 'success');
      } else {
        const data = await res.json();
        addNotification(data.error, 'error');
      }
    } catch (err) {
      addNotification('Rollback failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-left">
          <div className="animated-bg">
            <div className="circle circle-1"></div>
            <div className="circle circle-2"></div>
            <div className="circle circle-3"></div>
          </div>
          <div className="logo-section">
            <div className="logo">
              {APP_LOGO.startsWith('http') ? (
                <img src={APP_LOGO} alt="Logo" className="logo-img" />
              ) : (
                <span>{APP_LOGO}</span>
              )}
            </div>
            <h1>{APP_NAME.split(' ').slice(0, 2).join(' ')}</h1>
            <h2>{APP_NAME.split(' ').slice(2).join(' ')}</h2>
          </div>
          <div className="features">
            <div className="feature">
              <span className="feature-icon">🗄️</span>
              <div>
                <strong>Multi-Database Support</strong>
                <p>PostgreSQL, MySQL, Oracle</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">🔐</span>
              <div>
                <strong>SAML 2.0 Authentication</strong>
                <p>Enterprise-grade security</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">📝</span>
              <div>
                <strong>Advanced SQL Editor</strong>
                <p>Syntax highlighting & validation</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">📊</span>
              <div>
                <strong>Data Export</strong>
                <p>CSV, JSON, SQL, HTML, XML</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">🔄</span>
              <div>
                <strong>Transaction Management</strong>
                <p>Commit & rollback support</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">📜</span>
              <div>
                <strong>Query History</strong>
                <p>Track all your queries</p>
              </div>
            </div>
          </div>
        </div>
        <div className="login-right">
          <div className="login-card">
            <div className="card-icon">🔐</div>
            <h3>Welcome Back</h3>
            <p>Sign in with your corporate credentials to access the database management platform</p>
            <a href={`${API_URL}/api/auth/saml`} className="login-btn">
              <span className="btn-icon">🔑</span>
              <span>Login with SAML</span>
              <span className="btn-arrow">→</span>
            </a>
            <div className="login-footer">
              <div className="security-badges">
                <span className="badge">🔒 Secure</span>
                <span className="badge">⚡ Fast</span>
                <span className="badge">✓ Compliant</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      {/* Environment Banner */}
      <div className={`env-banner env-${APP_ENV.toLowerCase()}`}>
        <span className="env-label">{APP_ENV}</span>
        {APP_ENV === 'PROD' && <span className="env-warning">⚠️ PRODUCTION ENVIRONMENT - USE CAUTION</span>}
      </div>

      {loading && progress > 0 && <div className="progress-bar"><div className="progress-bar-fill" style={{width: `${progress}%`}}></div></div>}
      <div className="notifications">
        {notifications.map(n => (
          <Notification key={n.id} message={n.message} type={n.type} onClose={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} />
        ))}
      </div>

      {/* Destructive Query Confirmation */}
      {showDestructiveConfirm && (
        <div className="modal-overlay" onClick={() => setShowDestructiveConfirm(false)}>
          <div className="modal-dialog destructive-confirm" onClick={e => e.stopPropagation()}>
            <div className="modal-header critical">
              <h3>🚨 DESTRUCTIVE OPERATION</h3>
              <button onClick={() => setShowDestructiveConfirm(false)} className="btn-icon">✕</button>
            </div>
            <div className="modal-body">
              <div className="critical-warning">
                <p><strong>⚠️ WARNING: This operation cannot be undone!</strong></p>
                <p>You are about to execute a destructive query that will permanently modify or delete data.</p>
              </div>
              <div className="query-preview">
                <label>Query to execute:</label>
                <pre>{destructiveQuery}</pre>
              </div>
              <div className="confirmation-input">
                <label>Type the database name <strong>"{connectionInfo?.database || 'database'}"</strong> to confirm:</label>
                <input 
                  type="text" 
                  value={confirmDbName}
                  onChange={(e) => setConfirmDbName(e.target.value)}
                  placeholder="Type database name"
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowDestructiveConfirm(false); setConfirmDbName(''); }} className="btn-secondary">Cancel</button>
              <button 
                onClick={() => {
                  if (confirmDbName === (connectionInfo?.database || '')) {
                    executeQuery(destructiveQuery);
                    setShowDestructiveConfirm(false);
                    setConfirmDbName('');
                  } else {
                    addNotification('Database name does not match', 'error');
                  }
                }} 
                className="btn-danger"
                disabled={confirmDbName !== (connectionInfo?.database || '')}
              >
                Execute Destructive Query
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmDialog && (
        <div className="modal-overlay" onClick={() => setShowConfirmDialog(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚠️ Confirm Query Execution</h3>
              <button onClick={() => setShowConfirmDialog(false)} className="btn-icon">✕</button>
            </div>
            <div className="modal-body">
              <div className="warning-box">
                <p><strong>Warning:</strong> You are about to execute a mutating query that will modify the database.</p>
              </div>
              {queryRisk && (
                <div className={`risk-analysis risk-${queryRisk.severity}`}>
                  <h4>Query Risk Analysis:</h4>
                  <ul>
                    {queryRisk.risks.map((risk, i) => <li key={i}>{risk}</li>)}
                  </ul>
                </div>
              )}
              <div className="query-preview">
                <label>Query to execute:</label>
                <pre>{pendingQuery}</pre>
              </div>
              <div className="confirmation-checklist">
                <p>Please confirm:</p>
                <ul>
                  <li>✓ I have reviewed the query</li>
                  <li>✓ I understand this will modify data</li>
                  <li>✓ I can rollback if needed</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowConfirmDialog(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => executeQuery(pendingQuery)} className="btn-danger">Execute Query</button>
            </div>
          </div>
        </div>
      )}

      <header className="toolbar">
        <div className="toolbar-left">
          <div className="app-title">
            {APP_LOGO.startsWith('http') ? (
              <img src={APP_LOGO} alt="Logo" className="logo-small-img" />
            ) : (
              <span className="logo-small">{APP_LOGO}</span>
            )}
            <span>{APP_SHORT_NAME}</span>
          </div>
          {connected && (
            <div className="toolbar-tabs">
              <select 
                value={view} 
                onChange={(e) => setView(e.target.value)}
                className="view-selector"
              >
                <option value="sql">📝 SQL Editor</option>
                <option value="data">📊 Data</option>
                <option value="properties">⚙️ Properties</option>
                <option value="history">📜 History</option>
                <option value="dba">🛠️ DBA Tools</option>
              </select>
            </div>
          )}
        </div>
        <div className="toolbar-right">
          {connected && (
            <>
              <div className="read-only-toggle">
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={readOnlyMode} 
                    onChange={(e) => {
                      setReadOnlyMode(e.target.checked);
                      addNotification(e.target.checked ? 'Read-only mode enabled' : 'Read-only mode disabled', 'info');
                    }}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className="toggle-label">🔒 Read-Only</span>
              </div>
            </>
          )}
          {connected && connectionInfo && (
            <div className="connection-badge">
              <span className="status-dot"></span>
              {connectionInfo.type} @ {connectionInfo.host}
            </div>
          )}
          {connected && <button onClick={handleDisconnect} className="btn-disconnect">Disconnect</button>}
          {connected && (
            <button onClick={() => setShowSearchEverywhere(true)} className="btn-search" title="Search Everywhere (Ctrl+Shift+F)">
              🔍
            </button>
          )}
          <div className="notification-bell" onClick={() => setShowNotifications(!showNotifications)}>
            <span>🔔</span>
            {notificationHistory.length > 0 && <span className="badge-count">{notificationHistory.length}</span>}
            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-header">Notifications</div>
                {notificationHistory.length === 0 ? (
                  <div className="notification-empty">No notifications</div>
                ) : (
                  notificationHistory.map((n, i) => (
                    <div key={i} className={`notification-item notification-${n.type}`}>
                      <div className="notification-time">{n.time}</div>
                      <div className="notification-message">{n.message}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="user-menu">
            <button className="user-badge" onClick={() => setShowUserMenu(!showUserMenu)}>
              <span>👤</span> {user.name} <span className="dropdown-arrow">▼</span>
            </button>
            {showUserMenu && (
              <div className="user-dropdown">
                <button onClick={() => setDarkMode(!darkMode)} className="dropdown-item">
                  <span>{darkMode ? '☀️' : '🌙'}</span> {darkMode ? 'Light Mode' : 'Dark Mode'}
                </button>
                <button onClick={handleLogout} className="dropdown-item">
                  <span>🚪</span> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      
      {!connected ? (
        <div className="connection-page">
          <div className="connection-wizard">
            <h2>New Database Connection</h2>
            <form onSubmit={handleConnect} className="connection-form">
              <div className="form-row">
                <div className="form-field full-width">
                  <label>Database Type *</label>
                  <select name="type" value={dbType} onChange={(e) => setDbType(e.target.value)} required>
                    <option value="">Select database type...</option>
                    <option value="postgres">🐘 PostgreSQL</option>
                    <option value="mysql">🐬 MySQL</option>
                    <option value="oracle">🔶 Oracle Database</option>
                  </select>
                </div>
              </div>
              
              <div className="form-section">
                <h3>Connection Details</h3>
                <div className="form-row">
                  <div className="form-field">
                    <label>Host *</label>
                    <input name="host" placeholder="e.g., db.example.com or 192.168.1.100" defaultValue="" required />
                  </div>
                  <div className="form-field">
                    <label>Port *</label>
                    <input name="port" placeholder="e.g., 5432 (PostgreSQL), 3306 (MySQL), 1521 (Oracle)" defaultValue="" required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>Database *</label>
                    <input name="database" placeholder={dbType === 'oracle' ? 'SID or Service Name' : 'database_name'} required />
                  </div>
                  {dbType === 'oracle' && (
                    <div className="form-field">
                      <label>Service Name</label>
                      <input name="serviceName" placeholder="Optional: Use if connecting via service" />
                    </div>
                  )}
                  {dbType !== 'oracle' && <div className="form-field"></div>}
                </div>
              </div>

              <div className="form-section">
                <h3>Authentication</h3>
                <div className="form-row">
                  <div className="form-field">
                    <label>Username *</label>
                    <input name="username" placeholder="db_user" required />
                  </div>
                  <div className="form-field">
                    <label>Password *</label>
                    <input name="password" type="password" placeholder="••••••••" required />
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? '⏳ Connecting...' : '🔌 Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="main-workspace">
          {sidebarOpen && (
            <aside className="sidebar">
              <div className="sidebar-header">
                <h3>Database Navigator</h3>
                <div className="sidebar-actions">
                  <button onClick={() => setSidebarOpen(false)} className="btn-icon">✕</button>
                </div>
              </div>
              <ObjectBrowser
                connected={connected}
                schema={schema}
                schemas={schemas}
                functions={functions}
                views={views}
                indexes={indexes}
                sequences={sequences}
                triggers={triggers}
                onTableSelect={(table, schemaName) => loadTableInfo(table.table_name, schemaName)}
                onTableDoubleClick={(table, schemaName) => {
                  setSelectedTable(table.table_name);
                  setSelectedSchema(schemaName);
                  loadTableData(table.table_name, schemaName);
                  setView('data');
                }}
                onObjectSelect={(obj, schemaName, objType) => {
                  setSelectedObject(obj);
                  setSelectedObjectType(objType);
                  setShowObjectViewer(true);
                }}
                onRefresh={loadSchema}
                darkMode={darkMode}
              />
            </aside>
          )}
          
          <main className="content-area">
            {!sidebarOpen && (
              <button className="btn-sidebar-toggle" onClick={() => setSidebarOpen(true)}>☰</button>
            )}
            
            {pendingTransaction && (
              <div className="alert alert-warning">
                <span>⚠️ Transaction in progress - Changes not committed</span>
                <div className="alert-actions">
                  <button onClick={handleCommit} disabled={loading} className="btn-success">✓ Commit</button>
                  <button onClick={handleRollback} disabled={loading} className="btn-danger">✗ Rollback</button>
                </div>
              </div>
            )}
            
            {view === 'sql' && (
              <div className="sql-workspace">
                <div className={`sql-editor-wrapper ${results ? sqlEditorSize : ''}`}>
                  <SQLEditor
                    darkMode={darkMode}
                    onExecute={handleQuery}
                    onExplain={handleExplain}
                    schema={schema}
                    readOnlyMode={readOnlyMode}
                    loading={loading}
                    onCancel={() => {
                      if (abortController) {
                        abortController.abort();
                        addNotification('Query cancelled', 'info');
                      }
                    }}
                    onFileUpload={(filename) => {
                      addNotification(`File loaded: ${filename}`, 'success');
                    }}
                  />
                </div>
                {results && (
                  <>
                    <div className="resize-handle">
                      <div className="resize-handle-controls">
                        <button 
                          className="resize-btn" 
                          onClick={() => setSqlEditorSize('minimized')}
                          title="Minimize Editor"
                        >
                          ▼ Minimize
                        </button>
                        <button 
                          className="resize-btn" 
                          onClick={() => setSqlEditorSize('')}
                          title="Reset 50/50"
                        >
                          ◼ 50/50
                        </button>
                        <button 
                          className="resize-btn" 
                          onClick={() => setSqlEditorSize('maximized')}
                          title="Maximize Editor"
                        >
                          ▲ Maximize
                        </button>
                        <button 
                          className="resize-btn" 
                          onClick={() => setResults(null)}
                          title="Close Results"
                          style={{ marginLeft: '10px', background: '#e74c3c', color: '#fff' }}
                        >
                          ✕ Close
                        </button>
                      </div>
                    </div>
                    <div className="results-wrapper">
                      <ResultsViewer
                        results={results}
                        pendingTransaction={pendingTransaction}
                        onCommit={handleCommit}
                        onRollback={handleRollback}
                        onExport={(format, rowCount) => {
                          fetch(`${API_URL}/api/log/export`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ format, rowCount })
                      }).catch(() => {});
                    }}
                    darkMode={darkMode}
                  />
                    </div>
                  </>
                )}
              </div>
            )}
            
            {view === 'data' && tableData && (
              <div className="data-workspace">
                <div className="data-toolbar">
                  <h3>📊 {selectedSchema}.{selectedTable}</h3>
                  <div className="toolbar-actions">
                    <button onClick={() => loadTableData(selectedTable, selectedSchema)} className="btn-secondary">
                      🔄 Refresh
                    </button>
                    {tableData?.rows?.length > 0 && (
                      <div className="export-menu">
                        <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn-export">
                          📥 Export ▼
                        </button>
                        {showExportMenu && (
                          <div className="export-dropdown">
                            <button onClick={() => exportToCSV(tableData)} className="export-item">
                              <span>📄</span> CSV
                            </button>
                            <button onClick={() => exportToJSON(tableData)} className="export-item">
                              <span>📋</span> JSON
                            </button>
                            <button onClick={() => exportToSQL(tableData)} className="export-item">
                              <span>💾</span> SQL
                            </button>
                            <button onClick={() => exportToHTML(tableData)} className="export-item">
                              <span>🌐</span> HTML
                            </button>
                            <button onClick={() => exportToXML(tableData)} className="export-item">
                              <span>📰</span> XML
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>{tableData.fields?.map(f => <th key={f}>{f}</th>)}</tr>
                    </thead>
                    <tbody>
                      {tableData.rows?.map((r, i) => (
                        <tr key={i}>
                          {Object.values(r).map((v, j) => (
                            <td key={j}>{v === null ? <span className="null-value">NULL</span> : String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {view === 'properties' && selectedTable && (
              <div className="properties-workspace">
                <h3>⚙️ Table: {selectedSchema}.{selectedTable}</h3>
                <div className="properties-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Type</th>
                        <th>Nullable</th>
                        <th>Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableColumns.map((col, i) => (
                        <tr key={i}>
                          <td><strong>{col.column_name}</strong></td>
                          <td><code>{col.data_type}</code></td>
                          <td>{col.is_nullable === 'YES' ? '✓' : '✗'}</td>
                          <td>{col.column_default || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'history' && (
              <div className="history-workspace">
                <h3>📜 Query History</h3>
                <div className="history-list">
                  {queryHistory.length > 0 ? queryHistory.map((item, i) => (
                    <div key={i} className="history-item" onClick={() => setQuery(item.query)}>
                      <div className="history-time">{new Date(item.timestamp).toLocaleString()}</div>
                      <div className="history-query">{item.query}</div>
                      <div className="history-meta">{item.rows} rows</div>
                    </div>
                  )) : (
                    <div className="empty-state">No query history</div>
                  )}
                </div>
              </div>
            )}

            {view === 'dba' && (
              <DBATools
                darkMode={darkMode}
                onNotification={addNotification}
              />
            )}

            {view === 'explain' && (
              <div className="explain-workspace">
                <div className="explain-header">
                  <h3>📊 Query Execution Plan</h3>
                  <button onClick={() => setView('sql')} className="btn-secondary">← Back to SQL</button>
                </div>
                <div className="explain-content">
                  {explainResult ? (
                    <pre className="explain-plan">{typeof explainResult === 'string' ? explainResult : JSON.stringify(explainResult, null, 2)}</pre>
                  ) : (
                    <div className="empty-state">No execution plan available</div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Object Viewer Modal */}
      {showObjectViewer && selectedObject && (
        <ObjectViewer
          objectType={selectedObjectType}
          objectName={
            selectedObject.routine_name || 
            selectedObject.table_name || 
            selectedObject.indexname || 
            selectedObject.sequence_name || 
            selectedObject.trigger_name
          }
          objectSchema={
            selectedObject.routine_schema || 
            selectedObject.table_schema || 
            selectedObject.schemaname || 
            selectedObject.sequence_schema || 
            selectedObject.trigger_schema
          }
          objectData={selectedObject}
          onClose={() => {
            setShowObjectViewer(false);
            setSelectedObject(null);
            setSelectedObjectType(null);
          }}
          darkMode={darkMode}
        />
      )}

      {/* Search Everywhere Modal */}
      {showSearchEverywhere && (
        <SearchEverywhere
          schema={schema}
          functions={functions}
          views={views}
          indexes={indexes}
          sequences={sequences}
          triggers={triggers}
          onClose={() => setShowSearchEverywhere(false)}
          onSelect={(result) => {
            addNotification(`Selected: ${result.name} (${result.type})`, 'info');
          }}
        />
      )}
    </div>
  );
}
