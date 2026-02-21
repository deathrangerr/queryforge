import { useState, useEffect } from 'react';
import './DBATools.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export default function DBATools({ darkMode, onNotification }) {
  const [activeTab, setActiveTab] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [locks, setLocks] = useState([]);
  const [lockGraph, setLockGraph] = useState([]);
  const [users, setUsers] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [bloat, setBloat] = useState([]);
  const [autovacuum, setAutovacuum] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState({ readOnly: false, timeout: false });

  const loadSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/sessions`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      onNotification?.('Failed to load sessions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLocks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/locks`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setLocks(data.locks || []);
      }
      
      // Load lock graph
      const graphRes = await fetch(`${API_URL}/api/db/lock-graph`, {
        method: 'POST',
        credentials: 'include'
      });
      if (graphRes.ok) {
        const graphData = await graphRes.json();
        setLockGraph(graphData.lockGraph || []);
      }
    } catch (err) {
      onNotification?.('Failed to load locks', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/users`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      onNotification?.('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const killSession = async (pid, sid, serial) => {
    if (!confirm('Are you sure you want to kill this session?')) return;
    
    try {
      const res = await fetch(`${API_URL}/api/db/kill-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pid, sid, serial })
      });
      if (res.ok) {
        onNotification?.('Session killed successfully', 'success');
        loadSessions();
      } else {
        const data = await res.json();
        onNotification?.(data.error, 'error');
      }
    } catch (err) {
      onNotification?.('Failed to kill session', 'error');
    }
  };

  const loadPerformance = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/performance`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setPerformance(data);
      }
    } catch (err) {
      onNotification?.('Failed to load performance data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMaintenance = async () => {
    setLoading(true);
    try {
      const [bloatRes, vacuumRes] = await Promise.all([
        fetch(`${API_URL}/api/db/bloat`, { method: 'POST', credentials: 'include' }),
        fetch(`${API_URL}/api/db/autovacuum-status`, { method: 'POST', credentials: 'include' })
      ]);
      
      if (bloatRes.ok) {
        const data = await bloatRes.json();
        setBloat(data.bloat || []);
      }
      if (vacuumRes.ok) {
        const data = await vacuumRes.json();
        setAutovacuum(data.status || []);
      }
    } catch (err) {
      onNotification?.('Failed to load maintenance data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runVacuum = async (table, analyze = false) => {
    if (!confirm(`Run VACUUM${analyze ? ' ANALYZE' : ''} on ${table}? This may lock the table briefly.`)) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/vacuum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ table, analyze })
      });
      if (res.ok) {
        onNotification?.(`VACUUM${analyze ? ' ANALYZE' : ''} completed successfully`, 'success');
        loadMaintenance();
      } else {
        const data = await res.json();
        onNotification?.(data.error, 'error');
      }
    } catch (err) {
      onNotification?.('Failed to run VACUUM', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleEmergencyMode = async (mode) => {
    const actions = {
      readOnly: 'enable read-only mode',
      timeout: 'set statement timeout to 10 seconds'
    };
    
    if (!confirm(`Are you sure you want to ${actions[mode]}? This affects all connections.`)) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/db/emergency-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: mode, enable: !emergencyMode[mode] })
      });
      if (res.ok) {
        setEmergencyMode(prev => ({ ...prev, [mode]: !prev[mode] }));
        onNotification?.(`Emergency mode ${!emergencyMode[mode] ? 'enabled' : 'disabled'}`, 'success');
      } else {
        const data = await res.json();
        onNotification?.(data.error, 'error');
      }
    } catch (err) {
      onNotification?.('Failed to toggle emergency mode', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sessions') loadSessions();
    else if (activeTab === 'locks') loadLocks();
    else if (activeTab === 'users') loadUsers();
    else if (activeTab === 'performance') loadPerformance();
    else if (activeTab === 'maintenance') loadMaintenance();
  }, [activeTab]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (activeTab === 'sessions') loadSessions();
      else if (activeTab === 'locks') loadLocks();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeTab]);

  return (
    <div className="dba-tools">
      <div className="dba-header">
        <h3>🛠️ DBA Tools</h3>
        <div className="dba-actions">
          <div className="emergency-controls">
            <button
              onClick={() => toggleEmergencyMode('readOnly')}
              className={`btn-emergency ${emergencyMode.readOnly ? 'active' : ''}`}
              title="Toggle read-only mode"
            >
              {emergencyMode.readOnly ? '🔓' : '🔒'} Read-Only
            </button>
            <button
              onClick={() => toggleEmergencyMode('timeout')}
              className={`btn-emergency ${emergencyMode.timeout ? 'active' : ''}`}
              title="Toggle statement timeout (10s)"
            >
              {emergencyMode.timeout ? '⏱️' : '⏰'} Timeout
            </button>
          </div>
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (5s)</span>
          </label>
          <button onClick={() => {
            if (activeTab === 'sessions') loadSessions();
            else if (activeTab === 'locks') loadLocks();
            else if (activeTab === 'users') loadUsers();
            else if (activeTab === 'performance') loadPerformance();
            else if (activeTab === 'maintenance') loadMaintenance();
          }} disabled={loading} className="btn-refresh">
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      <div className="dba-tabs">
        <button
          className={activeTab === 'sessions' ? 'active' : ''}
          onClick={() => setActiveTab('sessions')}
        >
          👥 Sessions ({sessions.length})
        </button>
        <button
          className={activeTab === 'locks' ? 'active' : ''}
          onClick={() => setActiveTab('locks')}
        >
          🔒 Locks ({locks.length})
        </button>
        <button
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => setActiveTab('users')}
        >
          👤 Users ({users.length})
        </button>
        <button
          className={activeTab === 'performance' ? 'active' : ''}
          onClick={() => setActiveTab('performance')}
        >
          📊 Performance
        </button>
        <button
          className={activeTab === 'maintenance' ? 'active' : ''}
          onClick={() => setActiveTab('maintenance')}
        >
          🧰 Maintenance
        </button>
      </div>

      <div className="dba-content">{renderContent()}</div>
    </div>
  );

  function renderContent() {
    if (activeTab === 'sessions') {
      return (
        <div className="sessions-view">
          {sessions.length === 0 ? (
            <div className="empty-state">No active sessions</div>
          ) : (
            <table className="dba-table">
              <thead>
                <tr>
                  <th>PID/SID</th>
                  <th>User</th>
                  <th>Client</th>
                  <th>State/Status</th>
                  <th>Query</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session, i) => (
                  <tr key={i}>
                    <td>{session.pid || session.sid || session.id}</td>
                    <td>{session.usename || session.user || session.username}</td>
                    <td>{session.client_addr || session.host || 'N/A'}</td>
                    <td>
                      <span className={`status-badge status-${(session.state || session.status || '').toLowerCase()}`}>
                        {session.state || session.status || session.command}
                      </span>
                    </td>
                    <td className="query-cell" title={session.query || session.info}>
                      {session.query || session.info || 'N/A'}
                    </td>
                    <td>{session.duration || session.time || 'N/A'}</td>
                    <td>
                      <button
                        onClick={() => killSession(session.pid || session.id, session.sid, session.serial)}
                        className="btn-kill"
                      >
                        ⚠️ Kill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    }

    if (activeTab === 'locks') {
      return (
        <div className="locks-view">
          {lockGraph.length > 0 && (
            <div className="lock-graph">
              <h4>🔗 Blocking Chain</h4>
              <div className="lock-tree">
                {lockGraph.map((item, i) => (
                  <div key={i} className="lock-node" style={{ paddingLeft: `${item.depth * 20}px` }}>
                    <span className="blocker-badge">PID {item.blocker_pid}</span>
                    <span className="arrow">→</span>
                    <span className="blocked-badge">PID {item.blocked_pid}</span>
                    <span className="query-preview">{item.blocker_query?.substring(0, 50)}...</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {locks.length === 0 ? (
            <div className="empty-state">No locks found</div>
          ) : (
            <table className="dba-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Object</th>
                  <th>Mode</th>
                  <th>Granted</th>
                  <th>User</th>
                  <th>Query</th>
                </tr>
              </thead>
              <tbody>
                {locks.map((lock, i) => (
                  <tr key={i}>
                    <td>{lock.locktype || lock.lock_type || lock.type}</td>
                    <td>{lock.relation || lock.lock_table || lock.object_name || 'N/A'}</td>
                    <td>{lock.mode || lock.lock_mode || lock.lmode}</td>
                    <td>
                      <span className={`status-badge ${lock.granted ? 'status-granted' : 'status-waiting'}`}>
                        {lock.granted !== undefined ? (lock.granted ? 'Granted' : 'Waiting') : 'N/A'}
                      </span>
                    </td>
                    <td>{lock.usename || lock.username}</td>
                    <td className="query-cell" title={lock.query}>
                      {lock.query || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    }

    if (activeTab === 'performance') {
      if (!performance) return <div className="empty-state">Loading...</div>;
      if (performance.error) {
        return (
          <div className="error-state">
            <p>⚠️ {performance.error}</p>
            {performance.instructions && <p className="instructions">{performance.instructions}</p>}
          </div>
        );
      }
      
      return (
        <div className="performance-view">
          <section className="perf-section">
            <h4>🔥 Top Queries by Total Time</h4>
            {performance.topQueries?.length === 0 ? (
              <div className="empty-state">No query statistics available</div>
            ) : (
              <table className="dba-table">
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Calls</th>
                    <th>Total Time (ms)</th>
                    <th>Mean Time (ms)</th>
                    <th>Max Time (ms)</th>
                    <th>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.topQueries?.map((q, i) => (
                    <tr key={i}>
                      <td className="query-cell" title={q.query}>{q.query?.substring(0, 80)}...</td>
                      <td>{q.calls}</td>
                      <td>{parseFloat(q.total_exec_time || q.total_time || 0).toFixed(2)}</td>
                      <td>{parseFloat(q.mean_exec_time || q.mean_time || 0).toFixed(2)}</td>
                      <td>{parseFloat(q.max_exec_time || q.max_time || 0).toFixed(2)}</td>
                      <td>{q.rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="perf-section">
            <h4>🗑️ Unused Indexes</h4>
            {performance.unusedIndexes?.length === 0 ? (
              <div className="empty-state">No unused indexes found</div>
            ) : (
              <table className="dba-table">
                <thead>
                  <tr>
                    <th>Schema</th>
                    <th>Table</th>
                    <th>Index</th>
                    <th>Size</th>
                    <th>Scans</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.unusedIndexes?.map((idx, i) => (
                    <tr key={i}>
                      <td>{idx.schemaname}</td>
                      <td>{idx.tablename}</td>
                      <td>{idx.indexname || idx.indexrelname}</td>
                      <td>{idx.size}</td>
                      <td className="warning-cell">{idx.idx_scan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      );
    }

    if (activeTab === 'maintenance') {
      return (
        <div className="maintenance-view">
          <section className="maint-section">
            <h4>💀 Table Bloat Analysis</h4>
            {bloat.length === 0 ? (
              <div className="empty-state">No bloat detected</div>
            ) : (
              <table className="dba-table">
                <thead>
                  <tr>
                    <th>Schema</th>
                    <th>Table</th>
                    <th>Size</th>
                    <th>Dead Tuples</th>
                    <th>Bloat %</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bloat.map((b, i) => (
                    <tr key={i}>
                      <td>{b.schemaname}</td>
                      <td>{b.tablename}</td>
                      <td>{b.size}</td>
                      <td>{b.n_dead_tup}</td>
                      <td>
                        <span className={`bloat-badge ${b.bloat_pct > 20 ? 'high' : 'medium'}`}>
                          {b.bloat_pct}%
                        </span>
                      </td>
                      <td>
                        <button onClick={() => runVacuum(`${b.schemaname}.${b.tablename}`, false)} className="btn-action">
                          🧹 VACUUM
                        </button>
                        <button onClick={() => runVacuum(`${b.schemaname}.${b.tablename}`, true)} className="btn-action">
                          📊 ANALYZE
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="maint-section">
            <h4>🤖 Autovacuum Status</h4>
            {autovacuum.length === 0 ? (
              <div className="empty-state">No autovacuum data available</div>
            ) : (
              <table className="dba-table">
                <thead>
                  <tr>
                    <th>Schema</th>
                    <th>Table</th>
                    <th>Last Vacuum</th>
                    <th>Last Autovacuum</th>
                    <th>Last Analyze</th>
                    <th>Vacuum Count</th>
                    <th>Autovacuum Count</th>
                  </tr>
                </thead>
                <tbody>
                  {autovacuum.map((av, i) => (
                    <tr key={i}>
                      <td>{av.schemaname}</td>
                      <td>{av.tablename}</td>
                      <td>{av.last_vacuum || 'Never'}</td>
                      <td>{av.last_autovacuum || 'Never'}</td>
                      <td>{av.last_analyze || 'Never'}</td>
                      <td>{av.vacuum_count || 0}</td>
                      <td>{av.autovacuum_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      );
    }

    if (activeTab === 'users') {
      return (
        <div className="users-view">
          {users.length === 0 ? (
            <div className="empty-state">No users found</div>
          ) : (
            <table className="dba-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Privileges</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={i}>
                    <td><strong>{user.username || user.user}</strong></td>
                    <td>
                      <span className={`status-badge ${user.account_locked || user.account_status?.includes('LOCKED') ? 'status-locked' : 'status-active'}`}>
                        {user.account_status || (user.account_locked ? 'Locked' : 'Active')}
                      </span>
                    </td>
                    <td>
                      {user.is_superuser && <span className="privilege-badge superuser">Superuser</span>}
                      {user.can_create_db && <span className="privilege-badge">Create DB</span>}
                      {user.can_create_role && <span className="privilege-badge">Create Role</span>}
                      {user.can_login !== false && <span className="privilege-badge">Login</span>}
                    </td>
                    <td className="details-cell">
                      {user.host && `Host: ${user.host}`}
                      {user.profile && `Profile: ${user.profile}`}
                      {user.default_tablespace && `Tablespace: ${user.default_tablespace}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    }

    return null;
  }
}
