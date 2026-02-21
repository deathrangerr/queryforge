import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import cors from 'cors';
import pg from 'pg';
import mysql from 'mysql2/promise';
import oracledb from 'oracledb';
import fs from 'fs';
import dotenv from 'dotenv';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

dotenv.config({ path: '.env.server' });

const app = express();
const PORT = process.env.PORT || 3002;

// Create logs directory
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

// Winston logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'db-client' },
  transports: [
    // Activity logs (user actions)
    new DailyRotateFile({
      filename: 'logs/activity-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      level: 'info',
      format: winston.format.combine(
        winston.format((info) => info.type === 'ACTIVITY' || info.type === 'COMPLIANCE' ? info : false)(),
        winston.format.json()
      )
    }),
    // Error logs
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      level: 'error'
    }),
    // Security audit logs
    new DailyRotateFile({
      filename: 'logs/security-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '365d',
      level: 'warn',
      format: winston.format.combine(
        winston.format((info) => info.type === 'SECURITY' ? info : false)(),
        winston.format.json()
      )
    }),
    // Console output (simplified)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, user, action }) => {
          const userStr = user ? `[${user}]` : '';
          const actionStr = action ? `[${action}]` : '';
          return `${timestamp} ${level} ${userStr}${actionStr} ${message}`;
        })
      )
    })
  ]
});

// Logging utility
const log = {
  info: (msg, user = null, meta = {}) => logger.info(msg, { user, ...meta }),
  warn: (msg, user = null, meta = {}) => logger.warn(msg, { user, ...meta }),
  error: (msg, user = null, err = null, meta = {}) => logger.error(msg, { user, error: err?.message, stack: err?.stack, ...meta }),
  activity: (action, user, details = '', meta = {}) => logger.info(`${action}: ${details}`, { user, action, details, type: 'ACTIVITY', ...meta }),
  security: (event, user, details = '', meta = {}) => logger.warn(`SECURITY: ${event}`, { user, event, details, type: 'SECURITY', ...meta }),
  compliance: (event, user, details = '', meta = {}) => logger.info(`COMPLIANCE: ${event}`, { user, event, details, type: 'COMPLIANCE', ...meta })
};
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SESSION_SECRET = process.env.SESSION_SECRET || 'db-browser-secret';
const INACTIVITY_TIMEOUT = parseInt(process.env.INACTIVITY_TIMEOUT) || 5 * 60 * 1000; // 5 minutes
const MAX_SESSION_AGE = parseInt(process.env.MAX_SESSION_AGE) || 60 * 60 * 1000; // 60 minutes

// Track active sessions per user (single session enforcement)
const activeSessions = new Map(); // email -> sessionID

// Inactivity timeout tracking
const sessionTimeouts = new Map(); // sessionID -> timeout
const activeQueries = new Map(); // sessionID -> boolean (query running)

const resetInactivityTimer = (sessionID, email) => {
  // Don't reset timer if query is actively running
  if (activeQueries.get(sessionID)) {
    return;
  }
  
  // Clear existing timeout
  if (sessionTimeouts.has(sessionID)) {
    clearTimeout(sessionTimeouts.get(sessionID));
  }
  
  // Set new timeout
  const timeout = setTimeout(() => {
    // Double check no query is running before expiring
    if (activeQueries.get(sessionID)) {
      resetInactivityTimer(sessionID, email); // Reschedule
      return;
    }
    
    log.activity('SESSION_EXPIRED', email, 'Inactivity timeout', { sessionId: sessionID, timeout: INACTIVITY_TIMEOUT });
    log.security('SESSION_TIMEOUT', email, `Inactivity: ${INACTIVITY_TIMEOUT}ms`, { sessionId: sessionID });
    // Clean up session
    const dbClient = dbClients.get(sessionID);
    if (dbClient) {
      const { type, client, conn } = dbClient;
      if (type === 'postgres' && client) client.end().catch(() => {});
      else if (type === 'mysql' && conn) conn.end().catch(() => {});
      dbClients.delete(sessionID);
    }
    activeSessions.delete(email);
    sessionTimeouts.delete(sessionID);
    activeQueries.delete(sessionID);
  }, INACTIVITY_TIMEOUT);
  
  sessionTimeouts.set(sessionID, timeout);
};

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self' https: data: 'unsafe-inline'");
  next();
});

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
  secret: SESSION_SECRET, 
  resave: false, 
  saveUninitialized: false,
  rolling: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: MAX_SESSION_AGE,
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Log unauthorized access attempts
app.use((req, res, next) => {
  if (req.path.startsWith('/api/db') && !req.isAuthenticated()) {
    log.security('UNAUTHORIZED_ACCESS_ATTEMPT', 'anonymous', `${req.method} ${req.path}`, { 
      ip: req.ip, 
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method
    });
  }
  next();
});

// Middleware to track activity and enforce single session
app.use((req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    const email = req.user.email;
    const currentSessionID = req.sessionID;
    
    // Check if user has another active session
    if (activeSessions.has(email)) {
      const existingSessionID = activeSessions.get(email);
      if (existingSessionID !== currentSessionID) {
        // Terminate old session
        const oldDbClient = dbClients.get(existingSessionID);
        if (oldDbClient) {
          const { type, client, conn } = oldDbClient;
          if (type === 'postgres' && client) client.end().catch(() => {});
          else if (type === 'mysql' && conn) conn.end().catch(() => {});
          dbClients.delete(existingSessionID);
        }
        if (sessionTimeouts.has(existingSessionID)) {
          clearTimeout(sessionTimeouts.get(existingSessionID));
          sessionTimeouts.delete(existingSessionID);
        }
        log.warn(`Previous session terminated`, email);
        log.security('SESSION_TERMINATED', email, 'Single session enforcement', { oldSessionId: existingSessionID, newSessionId: currentSessionID });
      }
    }
    
    // Set current session as active
    activeSessions.set(email, currentSessionID);
    log.activity('LOGIN', email, `Session: ${currentSessionID}`, { sessionId: currentSessionID, ip: req.ip });
    log.security('USER_LOGIN', email, `IP: ${req.ip}`, { sessionId: currentSessionID, ip: req.ip, userAgent: req.headers['user-agent'] });
    
    // Reset inactivity timer
    resetInactivityTimer(currentSessionID, email);
  }
  next();
});

let samlConfig = JSON.parse(fs.readFileSync('./saml-config.json', 'utf8'));

passport.use(new SamlStrategy({
  entryPoint: samlConfig.entryPoint,
  issuer: samlConfig.issuer,
  identityProviderIssuer: samlConfig.identityProviderIssuer,
  callbackUrl: samlConfig.callbackUrl,
  cert: samlConfig.cert
}, (profile, done) => {
  const user = {
    email: profile.email || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || profile.nameID,
    name: profile.firstName || profile.displayName || profile.nameID || 'User'
  };
  done(null, user);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get('/api/auth/saml', passport.authenticate('saml'));
app.post('/api/auth/saml/callback', passport.authenticate('saml', { 
  failureRedirect: '/', 
  failureFlash: true 
}), (req, res) => {
  log.activity('SAML_AUTH_SUCCESS', req.user.email, `IP: ${req.ip}`, { ip: req.ip });
  log.security('SAML_AUTHENTICATION', req.user.email, 'Success', { ip: req.ip, userAgent: req.headers['user-agent'] });
  res.redirect(FRONTEND_URL);
}, (err, req, res, next) => {
  log.error('SAML authentication failed', null, err, { ip: req.ip });
  log.security('SAML_AUTH_FAILED', 'unknown', err.message, { ip: req.ip });
  res.status(500).send('Authentication failed: ' + err.message);
});
app.get('/api/auth/user', (req, res) => req.isAuthenticated() ? res.json(req.user) : res.status(401).json({ error: 'Not authenticated' }));

app.post('/api/auth/logout', (req, res) => { 
  const email = req.user?.email;
  const sessionID = req.sessionID;
  
  log.activity('LOGOUT', email, `Session: ${sessionID}`, { sessionId: sessionID, ip: req.ip });
  log.security('USER_LOGOUT', email, `IP: ${req.ip}`, { sessionId: sessionID, ip: req.ip });
  
  // Clean up database connection
  const dbClient = dbClients.get(sessionID);
  if (dbClient) {
    const { type, client, conn } = dbClient;
    if (type === 'postgres' && client) client.end().catch(() => {});
    else if (type === 'mysql' && conn) conn.end().catch(() => {});
    dbClients.delete(sessionID);
    log.compliance('DB_DISCONNECT_ON_LOGOUT', email, type, { sessionId: sessionID });
  }
  
  // Clean up session tracking
  if (email) {
    activeSessions.delete(email);
  }
  if (sessionTimeouts.has(sessionID)) {
    clearTimeout(sessionTimeouts.get(sessionID));
    sessionTimeouts.delete(sessionID);
  }
  
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

const dbClients = new Map(); // Store clients by session ID

app.post('/api/db/connect', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { type, host, port, database, username, password, serviceName } = req.body;
  const user = req.user.email;
  
  try {
    if (type === 'postgres') {
      const client = new pg.Client({ host, port, database, user: username, password });
      await client.connect();
      dbClients.set(req.sessionID, { type, client });
      req.session.dbConnected = true;
      req.session.dbType = type;
      log.activity('DB_CONNECT', user, `${type}://${host}:${port}/${database}`, { dbType: type, host, port, database, dbUser: username });
      log.security('DATABASE_ACCESS', user, `Connected to ${type}`, { dbType: type, host, port, database, dbUser: username, ip: req.ip });
      log.compliance('DATA_ACCESS_GRANTED', user, `${type}://${host}/${database}`, { dbType: type, host, database, dbUser: username });
      res.json({ success: true });
    } else if (type === 'mysql') {
      const conn = await mysql.createConnection({ host, port, database, user: username, password });
      dbClients.set(req.sessionID, { type, conn });
      req.session.dbConnected = true;
      req.session.dbType = type;
      log.activity('DB_CONNECT', user, `${type}://${host}:${port}/${database}`, { dbType: type, host, port, database, dbUser: username });
      log.security('DATABASE_ACCESS', user, `Connected to ${type}`, { dbType: type, host, port, database, dbUser: username, ip: req.ip });
      log.compliance('DATA_ACCESS_GRANTED', user, `${type}://${host}/${database}`, { dbType: type, host, database, dbUser: username });
      res.json({ success: true });
    } else if (type === 'oracle') {
      const connectString = `${host}:${port}/${serviceName || database}`;
      const conn = await oracledb.getConnection({ user: username, password, connectString });
      dbClients.set(req.sessionID, { type, conn });
      req.session.dbConnected = true;
      req.session.dbType = type;
      log.activity('DB_CONNECT', user, `${type}://${connectString}`, { dbType: type, host, port, database, dbUser: username });
      log.security('DATABASE_ACCESS', user, `Connected to ${type}`, { dbType: type, host, port, database, dbUser: username, ip: req.ip });
      log.compliance('DATA_ACCESS_GRANTED', user, `${type}://${connectString}`, { dbType: type, host, database, dbUser: username });
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Invalid database type' });
    }
  } catch (err) {
    log.error('Database connection failed', user, err, { dbType: type, host, port, database });
    log.security('DB_CONNECTION_FAILED', user, err.message, { dbType: type, host, port, database, ip: req.ip });
    res.status(500).json({ error: err.message });
  }
});

const getDbClient = (sessionID) => {
  return dbClients.get(sessionID);
};

const isMutatingQuery = (sql) => {
  const normalized = sql.trim().toUpperCase();
  return /^(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE)\s/.test(normalized);
};

app.post('/api/db/query', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { query } = req.body;
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  const user = req.user.email;
  
  if (!query || !query.trim()) return res.status(400).json({ error: 'Query cannot be empty' });
  if (!type) return res.status(400).json({ error: 'Not connected to database' });

  const isMutating = isMutatingQuery(query);
  const MAX_ROWS = 10000; // Limit to prevent memory issues
  const queryPreview = query.length > 100 ? query.substring(0, 100) + '...' : query;
  
  // Mark query as active to prevent session timeout
  activeQueries.set(req.sessionID, true);
  
  log.activity('QUERY_EXECUTE', user, `${isMutating ? '[MUTATING] ' : ''}${queryPreview.replace(/\n/g, ' ')}`, { 
    dbType: type, 
    isMutating, 
    queryLength: query.length,
    ip: req.ip 
  });
  
  if (isMutating) {
    log.security('MUTATING_QUERY', user, queryPreview.replace(/\n/g, ' '), { dbType: type, ip: req.ip });
    log.compliance('DATA_MODIFICATION_ATTEMPT', user, 'Mutating query executed', { dbType: type, queryPreview });
  }
  
  try {
    if (type === 'postgres') {
      if (isMutating) await client.query('BEGIN');
      const result = await client.query(query);
      
      // Limit rows if too many
      const rows = result.rows.length > MAX_ROWS ? result.rows.slice(0, MAX_ROWS) : result.rows;
      const truncated = result.rows.length > MAX_ROWS;
      
      log.info(`Query returned ${result.rowCount} rows${truncated ? ' (truncated)' : ''}`, user, { 
        rowCount: result.rowCount, 
        truncated, 
        dbType: type 
      });
      
      if (truncated) {
        log.compliance('RESULT_TRUNCATED', user, `${result.rows.length} rows truncated to ${MAX_ROWS}`, { 
          totalRows: result.rows.length, 
          returnedRows: MAX_ROWS 
        });
      }
      
      res.json({ 
        rows, 
        fields: result.fields.map(f => f.name),
        isMutating,
        rowCount: result.rowCount,
        truncated,
        totalRows: result.rows.length
      });
    } else if (type === 'mysql') {
      if (isMutating) await conn.query('START TRANSACTION');
      
      // MySQL: Use query() for DDL and SELECT with LIMIT, execute() for others
      const isDDL = /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE)\s/i.test(query);
      const isSelectWithLimit = /^\s*SELECT.*LIMIT/is.test(query);
      
      let rows, fields;
      if (isDDL || isSelectWithLimit) {
        [rows, fields] = await conn.query(query);
      } else {
        [rows, fields] = await conn.execute(query);
      }
      
      // Limit rows if too many
      const limitedRows = Array.isArray(rows) && rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows;
      const truncated = Array.isArray(rows) && rows.length > MAX_ROWS;
      const rowCount = Array.isArray(rows) ? rows.length : rows.affectedRows;
      
      log.info(`Query returned ${rowCount} rows${truncated ? ' (truncated)' : ''}`, user, { 
        rowCount, 
        truncated, 
        dbType: type 
      });
      
      if (truncated) {
        log.compliance('RESULT_TRUNCATED', user, `${rows.length} rows truncated to ${MAX_ROWS}`, { 
          totalRows: rows.length, 
          returnedRows: MAX_ROWS 
        });
      }
      
      res.json({ 
        rows: limitedRows, 
        fields: fields.map(f => f.name),
        isMutating,
        rowCount,
        truncated,
        totalRows: Array.isArray(rows) ? rows.length : rows.affectedRows
      });
    } else if (type === 'oracle') {
      if (isMutating) await conn.execute('BEGIN NULL; END;'); // Oracle transaction start
      
      // Oracle: Remove trailing semicolons (not supported in execute())
      const cleanQuery = query.trim().replace(/;+$/, '');
      
      const result = await conn.execute(cleanQuery, [], { 
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: MAX_ROWS + 1 // Fetch one extra to detect truncation
      });
      
      const rows = result.rows || [];
      const truncated = rows.length > MAX_ROWS;
      const limitedRows = truncated ? rows.slice(0, MAX_ROWS) : rows;
      const rowCount = result.rowsAffected || rows.length;
      
      log.info(`Query returned ${rowCount} rows${truncated ? ' (truncated)' : ''}`, user, { 
        rowCount, 
        truncated, 
        dbType: type 
      });
      
      if (truncated) {
        log.compliance('RESULT_TRUNCATED', user, `${rows.length} rows truncated to ${MAX_ROWS}`, { 
          totalRows: rows.length, 
          returnedRows: MAX_ROWS 
        });
      }
      
      // Extract field names from first row
      const fields = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];
      
      res.json({ 
        rows: limitedRows, 
        fields,
        isMutating,
        rowCount,
        truncated,
        totalRows: rows.length
      });
    }
  } catch (err) {
    log.error('Query execution failed', user, err, { dbType: type, queryPreview, isMutating });
    log.security('QUERY_FAILED', user, err.message, { dbType: type, isMutating, ip: req.ip });
    if (isMutating) {
      try {
        if (type === 'postgres') await client.query('ROLLBACK');
        else if (type === 'mysql') await conn.query('ROLLBACK');
        else if (type === 'oracle') await conn.execute('ROLLBACK');
        log.warn('Auto-rollback on query error', user, { dbType: type });
        log.compliance('AUTO_ROLLBACK', user, 'Transaction rolled back due to error', { dbType: type });
      } catch (rollbackErr) {
        log.error('Auto-rollback failed', user, rollbackErr, { dbType: type });
        log.security('ROLLBACK_FAILED', user, rollbackErr.message, { dbType: type });
      }
    }
    res.status(500).json({ error: err.message });
  } finally {
    // Mark query as complete, allow session timeout to resume
    activeQueries.set(req.sessionID, false);
    resetInactivityTimer(req.sessionID, user);
  }
});

app.post('/api/db/commit', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  const user = req.user.email;
  
  try {
    if (type === 'postgres') await client.query('COMMIT');
    else if (type === 'mysql') await conn.query('COMMIT');
    else if (type === 'oracle') await conn.commit();
    log.activity('TRANSACTION_COMMIT', user, type, { dbType: type, ip: req.ip });
    log.compliance('DATA_MODIFICATION_COMMITTED', user, 'Transaction committed', { dbType: type });
    res.json({ success: true });
  } catch (err) {
    log.error('Transaction commit failed', user, err, { dbType: type });
    log.security('COMMIT_FAILED', user, err.message, { dbType: type, ip: req.ip });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/rollback', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  const user = req.user.email;
  
  try {
    if (type === 'postgres') await client.query('ROLLBACK');
    else if (type === 'mysql') await conn.query('ROLLBACK');
    else if (type === 'oracle') await conn.rollback();
    log.activity('TRANSACTION_ROLLBACK', user, type, { dbType: type, ip: req.ip });
    log.compliance('DATA_MODIFICATION_REVERTED', user, 'Transaction rolled back', { dbType: type });
    res.json({ success: true });
  } catch (err) {
    log.error('Transaction rollback failed', user, err, { dbType: type });
    log.security('ROLLBACK_FAILED', user, err.message, { dbType: type, ip: req.ip });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/schema', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const tables = await client.query(`
        SELECT table_name, table_type, table_schema
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `);
      const schemas = await client.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schema_name
      `);
      res.json({ tables: tables.rows, schemas: schemas.rows });
    } else if (type === 'mysql') {
      const [tables] = await conn.execute(`
        SELECT table_name, table_type, table_schema
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        ORDER BY table_name
      `);
      const [schemas] = await conn.execute(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        ORDER BY schema_name
      `);
      res.json({ tables, schemas });
    } else if (type === 'oracle') {
      const tables = await conn.execute(`
        SELECT table_name, 'TABLE' as table_type, owner as table_schema
        FROM all_tables 
        WHERE owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'DBSNMP')
        ORDER BY owner, table_name
      `);
      const schemas = await conn.execute(`
        SELECT DISTINCT owner as schema_name
        FROM all_tables 
        WHERE owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'DBSNMP')
        ORDER BY owner
      `);
      res.json({ 
        tables: tables.rows.map(r => ({ table_name: r[0], table_type: r[1], table_schema: r[2] })),
        schemas: schemas.rows.map(r => ({ schema_name: r[0] }))
      });
    }
  } catch (err) {
    log.error('Schema load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/table-info', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { tableName, schema } = req.body;
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  if (!tableName) return res.status(400).json({ error: 'Table name required' });
  
  try {
    if (type === 'postgres') {
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = $2
        ORDER BY ordinal_position
      `, [tableName, schema || 'public']);
      res.json({ columns: columns.rows });
    } else if (type === 'mysql') {
      const [columns] = await conn.execute(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = ? AND table_schema = ?
        ORDER BY ordinal_position
      `, [tableName, schema || conn.config.database]);
      res.json({ columns });
    }
  } catch (err) {
    log.error('Table info load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/table-data', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { tableName, schema, limit = 100, offset = 0 } = req.body;
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  if (!tableName) return res.status(400).json({ error: 'Table name required' });
  
  try {
    if (type === 'postgres') {
      const fullName = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
      const result = await client.query(`SELECT * FROM ${fullName} LIMIT $1 OFFSET $2`, [limit, offset]);
      res.json({ rows: result.rows, fields: result.fields.map(f => f.name) });
    } else if (type === 'mysql') {
      const fullName = schema ? `\`${schema}\`.\`${tableName}\`` : `\`${tableName}\``;
      const [rows, fields] = await conn.execute(`SELECT * FROM ${fullName} LIMIT ? OFFSET ?`, [limit, offset]);
      res.json({ rows, fields: fields.map(f => f.name) });
    } else if (type === 'oracle') {
      const fullName = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
      const result = await conn.execute(`SELECT * FROM ${fullName} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`, { offset, limit });
      res.json({ 
        rows: result.rows.map(r => {
          const obj = {};
          result.metaData.forEach((col, i) => obj[col.name] = r[i]);
          return obj;
        }),
        fields: result.metaData.map(c => c.name)
      });
    }
  } catch (err) {
    log.error('Table data load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Get all functions/procedures
app.post('/api/db/functions', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`
        SELECT routine_name, routine_schema, routine_type, data_type as return_type
        FROM information_schema.routines
        WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY routine_schema, routine_name
      `);
      res.json({ functions: result.rows });
    } else if (type === 'mysql') {
      const [rows] = await conn.execute(`
        SELECT routine_name, routine_schema, routine_type, data_type as return_type
        FROM information_schema.routines
        WHERE routine_schema = DATABASE()
        ORDER BY routine_name
      `);
      res.json({ functions: rows });
    } else if (type === 'oracle') {
      const result = await conn.execute(`
        SELECT object_name as routine_name, owner as routine_schema, object_type as routine_type
        FROM all_objects
        WHERE object_type IN ('FUNCTION', 'PROCEDURE', 'PACKAGE')
        AND owner NOT IN ('SYS', 'SYSTEM')
        ORDER BY owner, object_name
      `);
      res.json({ 
        functions: result.rows.map(r => ({ 
          routine_name: r[0], 
          routine_schema: r[1], 
          routine_type: r[2] 
        }))
      });
    }
  } catch (err) {
    log.error('Functions load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Get all views
app.post('/api/db/views', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`
        SELECT table_name, table_schema, view_definition
        FROM information_schema.views
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `);
      res.json({ views: result.rows });
    } else if (type === 'mysql') {
      const [rows] = await conn.execute(`
        SELECT table_name, table_schema, view_definition
        FROM information_schema.views
        WHERE table_schema = DATABASE()
        ORDER BY table_name
      `);
      res.json({ views: rows });
    } else if (type === 'oracle') {
      const result = await conn.execute(`
        SELECT view_name as table_name, owner as table_schema, text as view_definition
        FROM all_views
        WHERE owner NOT IN ('SYS', 'SYSTEM')
        ORDER BY owner, view_name
      `);
      res.json({ 
        views: result.rows.map(r => ({ 
          table_name: r[0], 
          table_schema: r[1], 
          view_definition: r[2] 
        }))
      });
    }
  } catch (err) {
    log.error('Views load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Get all indexes
app.post('/api/db/indexes', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`
        SELECT indexname, tablename, schemaname, indexdef
        FROM pg_indexes
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename, indexname
      `);
      res.json({ indexes: result.rows });
    } else if (type === 'mysql') {
      const [rows] = await conn.execute(`
        SELECT index_name as indexname, table_name as tablename, table_schema as schemaname, 
               index_type, non_unique
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
        GROUP BY index_name, table_name, table_schema, index_type, non_unique
        ORDER BY table_name, index_name
      `);
      res.json({ indexes: rows });
    } else if (type === 'oracle') {
      const result = await conn.execute(`
        SELECT index_name as indexname, table_name as tablename, owner as schemaname, 
               index_type, uniqueness
        FROM all_indexes
        WHERE owner NOT IN ('SYS', 'SYSTEM')
        ORDER BY owner, table_name, index_name
      `);
      res.json({ 
        indexes: result.rows.map(r => ({ 
          indexname: r[0], 
          tablename: r[1], 
          schemaname: r[2],
          index_type: r[3],
          uniqueness: r[4]
        }))
      });
    }
  } catch (err) {
    log.error('Indexes load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Get all sequences
app.post('/api/db/sequences', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`
        SELECT sequence_name, sequence_schema, data_type, start_value, increment
        FROM information_schema.sequences
        WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY sequence_schema, sequence_name
      `);
      res.json({ sequences: result.rows });
    } else if (type === 'mysql') {
      // MySQL doesn't have sequences in the same way
      res.json({ sequences: [] });
    } else if (type === 'oracle') {
      const result = await conn.execute(`
        SELECT sequence_name, sequence_owner as sequence_schema, min_value, max_value, increment_by
        FROM all_sequences
        WHERE sequence_owner NOT IN ('SYS', 'SYSTEM')
        ORDER BY sequence_owner, sequence_name
      `);
      res.json({ 
        sequences: result.rows.map(r => ({ 
          sequence_name: r[0], 
          sequence_schema: r[1],
          min_value: r[2],
          max_value: r[3],
          increment_by: r[4]
        }))
      });
    }
  } catch (err) {
    log.error('Sequences load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Get all triggers
app.post('/api/db/triggers', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`
        SELECT trigger_name, event_object_table as table_name, trigger_schema, 
               event_manipulation, action_timing
        FROM information_schema.triggers
        WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY trigger_schema, event_object_table, trigger_name
      `);
      res.json({ triggers: result.rows });
    } else if (type === 'mysql') {
      const [rows] = await conn.execute(`
        SELECT trigger_name, event_object_table as table_name, trigger_schema,
               event_manipulation, action_timing
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE()
        ORDER BY event_object_table, trigger_name
      `);
      res.json({ triggers: rows });
    } else if (type === 'oracle') {
      const result = await conn.execute(`
        SELECT trigger_name, table_name, owner as trigger_schema, 
               triggering_event, trigger_type, status
        FROM all_triggers
        WHERE owner NOT IN ('SYS', 'SYSTEM')
        ORDER BY owner, table_name, trigger_name
      `);
      res.json({ 
        triggers: result.rows.map(r => ({ 
          trigger_name: r[0], 
          table_name: r[1],
          trigger_schema: r[2],
          triggering_event: r[3],
          trigger_type: r[4],
          status: r[5]
        }))
      });
    }
  } catch (err) {
    log.error('Triggers load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// EXPLAIN query
app.post('/api/db/explain', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { query } = req.body;
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  if (!query || !query.trim()) return res.status(400).json({ error: 'Query cannot be empty' });
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`EXPLAIN (FORMAT JSON, ANALYZE false) ${query}`);
      res.json({ plan: result.rows[0]['QUERY PLAN'] });
    } else if (type === 'mysql') {
      const [rows] = await conn.execute(`EXPLAIN FORMAT=JSON ${query}`);
      res.json({ plan: JSON.parse(rows[0]['EXPLAIN']) });
    } else if (type === 'oracle') {
      await conn.execute(`EXPLAIN PLAN FOR ${query}`);
      const result = await conn.execute(`
        SELECT plan_table_output 
        FROM TABLE(DBMS_XPLAN.DISPLAY())
      `);
      res.json({ plan: result.rows.map(r => r[0]).join('\n') });
    }
  } catch (err) {
    log.error('EXPLAIN failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Get active sessions
app.post('/api/db/sessions', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`
        SELECT pid, usename, application_name, client_addr, state, 
               query, query_start, state_change, wait_event_type, wait_event
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
        ORDER BY query_start DESC
      `);
      res.json({ sessions: result.rows });
    } else if (type === 'mysql') {
      const [rows] = await conn.execute(`
        SELECT id, user, host, db, command, time, state, info as query
        FROM information_schema.processlist
        WHERE id <> CONNECTION_ID()
        ORDER BY time DESC
      `);
      res.json({ sessions: rows });
    } else if (type === 'oracle') {
      const result = await conn.execute(`
        SELECT s.sid, s.serial#, s.username, s.program, s.status, 
               s.sql_id, sq.sql_text as query
        FROM v$session s
        LEFT JOIN v$sql sq ON s.sql_id = sq.sql_id
        WHERE s.type = 'USER' AND s.username IS NOT NULL
        ORDER BY s.logon_time DESC
      `);
      res.json({ 
        sessions: result.rows.map(r => ({
          sid: r[0], serial: r[1], username: r[2], program: r[3],
          status: r[4], sql_id: r[5], query: r[6]
        }))
      });
    }
  } catch (err) {
    log.error('Sessions load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Get locks
app.post('/api/db/locks', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`
        SELECT l.locktype, l.relation::regclass as relation, l.mode, l.granted,
               a.pid, a.usename, a.query, a.query_start
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE l.pid <> pg_backend_pid()
        ORDER BY l.granted, a.query_start
      `);
      res.json({ locks: result.rows });
    } else if (type === 'mysql') {
      const [rows] = await conn.execute(`
        SELECT r.trx_id, r.trx_state, r.trx_started, r.trx_wait_started,
               r.trx_mysql_thread_id, l.lock_mode, l.lock_type, l.lock_table
        FROM information_schema.innodb_trx r
        LEFT JOIN information_schema.innodb_locks l ON r.trx_id = l.lock_trx_id
        ORDER BY r.trx_started
      `);
      res.json({ locks: rows });
    } else if (type === 'oracle') {
      const result = await conn.execute(`
        SELECT s.sid, s.serial#, s.username, l.type, l.lmode, l.request,
               o.object_name, s.program
        FROM v$lock l
        JOIN v$session s ON l.sid = s.sid
        LEFT JOIN dba_objects o ON l.id1 = o.object_id
        WHERE s.username IS NOT NULL
        ORDER BY s.username, o.object_name
      `);
      res.json({ 
        locks: result.rows.map(r => ({
          sid: r[0], serial: r[1], username: r[2], type: r[3],
          lmode: r[4], request: r[5], object_name: r[6], program: r[7]
        }))
      });
    }
  } catch (err) {
    log.error('Locks load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Kill session
app.post('/api/db/kill-session', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { pid, sid, serial } = req.body;
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  const user = req.user.email;
  
  try {
    if (type === 'postgres') {
      await client.query('SELECT pg_terminate_backend($1)', [pid]);
      log.security('SESSION_KILLED', user, `Terminated PID ${pid}`, { pid, dbType: type, ip: req.ip });
    } else if (type === 'mysql') {
      await conn.execute('KILL ?', [pid]);
      log.security('SESSION_KILLED', user, `Killed connection ${pid}`, { pid, dbType: type, ip: req.ip });
    } else if (type === 'oracle') {
      await conn.execute(`ALTER SYSTEM KILL SESSION '${sid},${serial}' IMMEDIATE`);
      log.security('SESSION_KILLED', user, `Killed session ${sid},${serial}`, { sid, serial, dbType: type, ip: req.ip });
    }
    res.json({ success: true });
  } catch (err) {
    log.error('Kill session failed', user, err);
    res.status(500).json({ error: err.message });
  }
});

// Get users/roles
app.post('/api/db/users', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  
  try {
    if (type === 'postgres') {
      const result = await client.query(`
        SELECT rolname as username, rolsuper as is_superuser, 
               rolcreaterole as can_create_role, rolcreatedb as can_create_db,
               rolcanlogin as can_login, rolconnlimit as connection_limit
        FROM pg_roles
        ORDER BY rolname
      `);
      res.json({ users: result.rows });
    } else if (type === 'mysql') {
      const [rows] = await conn.execute(`
        SELECT user as username, host, 
               account_locked, password_expired
        FROM mysql.user
        ORDER BY user
      `);
      res.json({ users: rows });
    } else if (type === 'oracle') {
      const result = await conn.execute(`
        SELECT username, account_status, lock_date, expiry_date,
               default_tablespace, profile, created
        FROM dba_users
        ORDER BY username
      `);
      res.json({ 
        users: result.rows.map(r => ({
          username: r[0], account_status: r[1], lock_date: r[2],
          expiry_date: r[3], default_tablespace: r[4], profile: r[5], created: r[6]
        }))
      });
    }
  } catch (err) {
    log.error('Users load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Phase A: Emergency Mode
app.post('/api/db/emergency-mode', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID);
  if (!dbClient) return res.status(400).json({ error: 'Not connected to database' });
  
  const { action, enable } = req.body;
  const { type, client } = dbClient;
  const user = req.user.email;
  
  try {
    if (type === 'postgresql') {
      if (action === 'readOnly') {
        const cmd = enable ? 
          "ALTER DATABASE current_database() SET default_transaction_read_only = on" :
          "ALTER DATABASE current_database() SET default_transaction_read_only = off";
        await client.query(cmd);
      } else if (action === 'timeout') {
        const cmd = enable ?
          "ALTER DATABASE current_database() SET statement_timeout = 10000" :
          "ALTER DATABASE current_database() SET statement_timeout = 0";
        await client.query(cmd);
      }
    } else if (type === 'mysql') {
      if (action === 'readOnly') {
        await client.query(`SET GLOBAL read_only = ${enable ? 1 : 0}`);
      } else if (action === 'timeout') {
        await client.query(`SET GLOBAL max_execution_time = ${enable ? 10000 : 0}`);
      }
    }
    
    securityLogger.info('EMERGENCY_MODE', { user, action, enable });
    res.json({ success: true });
  } catch (err) {
    log.error('Emergency mode failed', user, err);
    res.status(500).json({ error: err.message });
  }
});

// Phase A: Lock Graph
app.post('/api/db/lock-graph', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID);
  if (!dbClient) return res.status(400).json({ error: 'Not connected to database' });
  
  const { type, client } = dbClient;
  
  try {
    let lockGraph = [];
    
    if (type === 'postgresql') {
      const result = await client.query(`
        SELECT 
          blocking.pid as blocker_pid,
          blocked.pid as blocked_pid,
          blocking.query as blocker_query,
          blocked.query as blocked_query,
          1 as depth
        FROM pg_locks blocked
        JOIN pg_stat_activity blocked_activity ON blocked.pid = blocked_activity.pid
        JOIN pg_locks blocking ON blocked.locktype = blocking.locktype
          AND blocked.database IS NOT DISTINCT FROM blocking.database
          AND blocked.relation IS NOT DISTINCT FROM blocking.relation
          AND blocked.page IS NOT DISTINCT FROM blocking.page
          AND blocked.tuple IS NOT DISTINCT FROM blocking.tuple
          AND blocked.virtualxid IS NOT DISTINCT FROM blocking.virtualxid
          AND blocked.transactionid IS NOT DISTINCT FROM blocking.transactionid
          AND blocked.classid IS NOT DISTINCT FROM blocking.classid
          AND blocked.objid IS NOT DISTINCT FROM blocking.objid
          AND blocked.objsubid IS NOT DISTINCT FROM blocking.objsubid
          AND blocked.pid != blocking.pid
        JOIN pg_stat_activity blocking_activity ON blocking.pid = blocking_activity.pid
        WHERE NOT blocked.granted AND blocking.granted
        ORDER BY blocking.pid;
      `);
      lockGraph = result.rows;
    }
    
    res.json({ lockGraph });
  } catch (err) {
    log.error('Lock graph failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Phase A: Performance Monitor
app.post('/api/db/performance', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID);
  if (!dbClient) return res.status(400).json({ error: 'Not connected to database' });
  
  const { type, client } = dbClient;
  
  try {
    if (type === 'postgresql') {
      // Check if pg_stat_statements exists
      const extCheck = await client.query(
        "SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'"
      );
      
      if (extCheck.rows.length === 0) {
        return res.json({
          error: 'pg_stat_statements extension not installed',
          instructions: 'Run: CREATE EXTENSION pg_stat_statements;'
        });
      }
      
      const topQueries = await client.query(`
        SELECT 
          query,
          calls,
          total_exec_time,
          mean_exec_time,
          max_exec_time,
          rows
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY total_exec_time DESC
        LIMIT 20;
      `);
      
      const unusedIndexes = await client.query(`
        SELECT 
          schemaname, tablename, indexrelname as indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as size,
          idx_scan
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0
        AND indexrelname NOT LIKE '%_pkey'
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 20;
      `);
      
      res.json({
        topQueries: topQueries.rows,
        unusedIndexes: unusedIndexes.rows
      });
    } else {
      res.json({ error: 'Performance monitoring only available for PostgreSQL' });
    }
  } catch (err) {
    log.error('Performance load failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Phase A: Bloat Analysis
app.post('/api/db/bloat', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID);
  if (!dbClient) return res.status(400).json({ error: 'Not connected to database' });
  
  const { type, client } = dbClient;
  
  try {
    if (type === 'postgresql') {
      const result = await client.query(`
        SELECT 
          schemaname, tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          n_dead_tup,
          ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as bloat_pct
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 0
        ORDER BY n_dead_tup DESC
        LIMIT 50;
      `);
      res.json({ bloat: result.rows });
    } else {
      res.json({ bloat: [] });
    }
  } catch (err) {
    log.error('Bloat analysis failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Phase A: Autovacuum Status
app.post('/api/db/autovacuum-status', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID);
  if (!dbClient) return res.status(400).json({ error: 'Not connected to database' });
  
  const { type, client } = dbClient;
  
  try {
    if (type === 'postgresql') {
      const result = await client.query(`
        SELECT 
          schemaname, tablename,
          last_vacuum, last_autovacuum,
          last_analyze, last_autoanalyze,
          vacuum_count, autovacuum_count
        FROM pg_stat_user_tables
        ORDER BY last_autovacuum DESC NULLS LAST
        LIMIT 50;
      `);
      res.json({ status: result.rows });
    } else {
      res.json({ status: [] });
    }
  } catch (err) {
    log.error('Autovacuum status failed', req.user.email, err);
    res.status(500).json({ error: err.message });
  }
});

// Phase A: VACUUM
app.post('/api/db/vacuum', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID);
  if (!dbClient) return res.status(400).json({ error: 'Not connected to database' });
  
  const { table, analyze } = req.body;
  const { type, client } = dbClient;
  const user = req.user.email;
  
  try {
    if (type === 'postgresql') {
      const cmd = analyze ? `VACUUM ANALYZE ${table}` : `VACUUM ${table}`;
      await client.query(cmd);
      activityLogger.info('VACUUM_EXECUTED', { user, table, analyze });
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'VACUUM only available for PostgreSQL' });
    }
  } catch (err) {
    log.error('VACUUM failed', user, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/db/disconnect', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const dbClient = getDbClient(req.sessionID); if (!dbClient) return res.status(400).json({ error: "Not connected to database" }); const { type, client, conn } = dbClient;
  const user = req.user.email;
  
  try {
    if (type === 'postgres' && client) await client.end();
    else if (type === 'mysql' && conn) await conn.end();
    dbClients.delete(req.sessionID); req.session.dbConnected = false;
    log.activity('DB_DISCONNECT', user, type, { dbType: type, sessionId: req.sessionID });
    log.compliance('DATA_ACCESS_REVOKED', user, `Disconnected from ${type}`, { dbType: type });
    res.json({ success: true });
  } catch (err) {
    log.error('Database disconnect failed', user, err, { dbType: type });
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  const host = process.env.HOST || '0.0.0.0';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  log.info(`Server running on ${protocol}://${host}:${PORT}`);
});

// Export logging endpoint
app.post('/api/log/export', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { format, rowCount } = req.body;
  const user = req.user.email;
  
  log.activity('DATA_EXPORT', user, `${format} format, ${rowCount} rows`, { format, rowCount, ip: req.ip });
  log.compliance('DATA_EXPORT', user, `Exported ${rowCount} rows as ${format}`, { format, rowCount });
  
  res.json({ success: true });
});

// Upload logging endpoint
app.post('/api/log/upload', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const { fileName, fileSize } = req.body;
  const user = req.user.email;
  
  log.activity('FILE_UPLOAD', user, `${fileName} (${fileSize} bytes)`, { fileName, fileSize, ip: req.ip });
  log.security('FILE_UPLOAD', user, `Uploaded SQL file: ${fileName}`, { fileName, fileSize, ip: req.ip });
  
  res.json({ success: true });
});
