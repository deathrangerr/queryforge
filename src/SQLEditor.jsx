import { useState, useEffect, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { keymap } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { format } from 'sql-formatter';
import './SQLEditor.css';

export default function SQLEditor({ 
  darkMode, 
  onExecute, 
  onExplain,
  schema = [],
  readOnlyMode = false,
  loading = false,
  onCancel,
  onFileUpload
}) {
  const [tabs, setTabs] = useState(() => {
    const saved = localStorage.getItem('sqlTabs');
    return saved ? JSON.parse(saved) : [{ id: 1, name: 'Query 1', query: '', active: true }];
  });
  const [activeTabId, setActiveTabId] = useState(tabs.find(t => t.active)?.id || 1);
  const editorViewRef = useRef(null);

  // Save tabs to localStorage
  useEffect(() => {
    localStorage.setItem('sqlTabs', JSON.stringify(tabs));
  }, [tabs]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const getSelectedText = () => {
    if (editorViewRef.current) {
      const selection = editorViewRef.current.state.selection.main;
      if (!selection.empty) {
        return editorViewRef.current.state.doc.sliceString(selection.from, selection.to);
      }
    }
    return '';
  };

  const addTab = () => {
    const newId = Math.max(...tabs.map(t => t.id), 0) + 1;
    setTabs(prev => [
      ...prev.map(t => ({ ...t, active: false })),
      { id: newId, name: `Query ${newId}`, query: '', active: true }
    ]);
    setActiveTabId(newId);
  };

  const closeTab = (id) => {
    if (tabs.length === 1) return; // Keep at least one tab
    const newTabs = tabs.filter(t => t.id !== id);
    if (activeTabId === id) {
      const idx = tabs.findIndex(t => t.id === id);
      const newActiveId = newTabs[Math.max(0, idx - 1)].id;
      setActiveTabId(newActiveId);
    }
    setTabs(newTabs);
  };

  const renameTab = (id, newName) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
  };

  const updateQuery = (query) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, query } : t));
  };

  const formatQuery = () => {
    try {
      const formatted = format(activeTab.query, {
        language: 'sql',
        uppercase: true,
        linesBetweenQueries: 2
      });
      updateQuery(formatted);
    } catch (err) {
      console.error('Format error:', err);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['.sql', '.txt'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(fileExt)) {
      alert('Invalid file type. Please upload .sql or .txt files only.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('File too large. Maximum size is 5MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      updateQuery(event.target.result);
      if (onFileUpload) onFileUpload(file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecute = () => {
    const selectedText = getSelectedText();
    const queryToExecute = selectedText || activeTab.query.trim();
    if (queryToExecute) {
      onExecute(queryToExecute);
    }
  };

  const handleExplain = () => {
    const selectedText = getSelectedText();
    const queryToExplain = selectedText || activeTab.query.trim();
    if (queryToExplain) {
      onExplain(queryToExplain);
    }
  };

  // Auto-complete configuration
  const autocompletions = useCallback(() => {
    const tables = schema.filter(s => s.table_type === 'BASE TABLE').map(s => s.table_name);
    const views = schema.filter(s => s.table_type === 'VIEW').map(s => s.table_name);
    
    return {
      schema: {
        tables: tables.map(t => ({ label: t, type: 'table' })),
        views: views.map(v => ({ label: v, type: 'view' }))
      }
    };
  }, [schema]);

  // Keyboard shortcuts
  const executeKeymap = keymap.of([
    {
      key: 'Ctrl-Enter',
      mac: 'Cmd-Enter',
      run: () => {
        handleExecute();
        return true;
      }
    }
  ]);

  return (
    <div className="sql-editor-container">
      {/* Tab Bar */}
      <div className="tab-bar">
        <div className="tabs">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <input
                type="text"
                value={tab.name}
                onChange={(e) => renameTab(tab.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="tab-name-input"
              />
              {tabs.length > 1 && (
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button className="tab-add" onClick={addTab}>+</button>
        </div>
        
        {/* Toolbar */}
        <div className="editor-toolbar">
          <button 
            onClick={handleExecute} 
            disabled={loading || readOnlyMode || !activeTab.query.trim()}
            className="btn-execute"
            title="Execute Query (Ctrl+Enter)"
          >
            ▶️ Execute
          </button>
          {loading && onCancel && (
            <button 
              onClick={onCancel} 
              className="btn-cancel-query"
              title="Cancel Query"
            >
              ⏹ Cancel
            </button>
          )}
          <button 
            onClick={handleExplain} 
            disabled={loading || !activeTab.query.trim()}
            className="btn-explain"
            title="Explain Query"
          >
            📊 Explain
          </button>
          <button 
            onClick={formatQuery} 
            disabled={!activeTab.query.trim()}
            className="btn-format"
            title="Format SQL"
          >
            ✨ Format
          </button>
          <label className="btn-upload" title="Upload SQL File">
            📁 Upload
            <input 
              type="file" 
              accept=".sql,.txt" 
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* Code Editor */}
      <div className="code-editor-wrapper">
        <CodeMirror
          value={activeTab.query}
          theme={darkMode ? 'dark' : 'light'}
          extensions={[sql(), executeKeymap, EditorView.lineWrapping]}
          onChange={(value) => updateQuery(value)}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
            // Scroll to cursor on change
            view.scrollDOM.addEventListener('DOMNodeInserted', () => {
              const cursor = view.state.selection.main.head;
              view.dispatch({
                effects: EditorView.scrollIntoView(cursor, { y: 'center' })
              });
            });
          }}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
      </div>
    </div>
  );
}
