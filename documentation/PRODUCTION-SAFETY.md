# Production Safety Controls

## Overview
Enterprise-grade safety controls to prevent accidental data loss and ensure safe database operations in production environments.

## Features Implemented

### 1. Environment Banner
**Visual indicator of current environment**

- **PROD**: Red banner with pulsing warning "⚠️ PRODUCTION ENVIRONMENT - USE CAUTION"
- **UAT**: Orange banner for staging/testing
- **DEV**: Green banner for development

**Configuration:**
```bash
# .env
VITE_APP_ENV=PROD  # Options: PROD, UAT, DEV
```

**Visual Design:**
- Always visible at top of application
- Color-coded for instant recognition
- Pulsing animation on PROD for extra attention

---

### 2. Read-Only Mode Toggle
**Session-level write protection**

**Features:**
- Toggle switch in toolbar (🔒 Read-Only)
- Blocks ALL mutating queries: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, REPLACE
- Instant notification when toggled
- Visual indicator always visible

**Use Cases:**
- Reviewing production data safely
- Training new team members
- Auditing without risk of changes
- Compliance requirements

**Behavior:**
- Enabled: All mutating queries rejected with error message
- Disabled: Normal operation with confirmations

---

### 3. Destructive Query Confirmation
**Critical protection for irreversible operations**

**Triggers on:**
- `DROP TABLE/DATABASE`
- `TRUNCATE TABLE`
- `ALTER TABLE` (schema changes)
- `DELETE FROM table` (without WHERE clause)

**Protection Mechanism:**
1. Shows RED critical warning dialog
2. Displays full query preview
3. **Requires typing exact database name to confirm**
4. Execute button disabled until correct name entered
5. Cannot be bypassed

**Visual Design:**
- Red border and header
- Large warning icons
- Clear explanation of consequences
- Input validation in real-time

---

### 4. Query Risk Analyzer
**Pre-execution risk assessment**

**Automatic Detection:**

| Risk Level | Triggers | Visual |
|------------|----------|--------|
| **Critical** | DROP, TRUNCATE, DELETE without WHERE | Red background |
| **High** | ALTER TABLE, UPDATE without WHERE | Orange background |
| **Medium** | Full table scan (no WHERE/LIMIT) | Yellow background |
| **Low** | Standard operations with WHERE | Green background |

**Risk Indicators:**
- ⚠️ DESTRUCTIVE: Permanent data deletion
- ⚠️ SCHEMA CHANGE: Table structure modification
- ⚠️ DELETE/UPDATE WITHOUT WHERE: All rows affected
- ℹ️ Full table scan: Performance impact
- 🔒 Write locks: Concurrent access impact

**Display:**
- Shown in confirmation dialogs
- Color-coded severity boxes
- Bullet list of specific risks
- Helps users make informed decisions

---

### 5. Standard Mutating Query Confirmation
**Confirmation for data-modifying operations**

**Triggers on:**
- INSERT
- UPDATE (with WHERE)
- DELETE (with WHERE)
- CREATE
- REPLACE

**Features:**
- Warning dialog with query preview
- Risk analysis (if applicable)
- Confirmation checklist:
  - ✓ I have reviewed the query
  - ✓ I understand this will modify data
  - ✓ I can rollback if needed
- Execute or Cancel options

---

## Safety Workflow

```
User enters query
       ↓
Is read-only mode ON?
  ├─ YES → Block mutating queries
  └─ NO → Continue
       ↓
Analyze query risk
       ↓
Is it destructive? (DROP/TRUNCATE/DELETE without WHERE)
  ├─ YES → Show critical confirmation (requires DB name)
  └─ NO → Continue
       ↓
Is it mutating? (INSERT/UPDATE/DELETE/CREATE)
  ├─ YES → Show standard confirmation with risk analysis
  └─ NO → Execute immediately
       ↓
Execute query
```

---

## Configuration

### Environment Variables

```bash
# .env (Frontend)
VITE_APP_ENV=DEV              # Environment: DEV, UAT, PROD
VITE_APP_NAME=Database Client
VITE_APP_SHORT_NAME=DB Client
VITE_API_URL=http://localhost:3002
```

### Production Deployment

**Recommended Settings:**
```bash
# Production .env
VITE_APP_ENV=PROD
VITE_API_URL=https://api.yourdomain.com
NODE_ENV=production
```

**Best Practices:**
1. Always set `VITE_APP_ENV=PROD` in production
2. Train users on destructive query confirmation
3. Encourage use of read-only mode for data review
4. Monitor logs for destructive operations
5. Regular backups before schema changes

---

## User Experience

### For Developers (DEV)
- Green banner
- All safety features active but less restrictive
- Quick iterations with confirmations

### For QA/Testers (UAT)
- Orange banner
- Full safety features
- Mimics production behavior

### For Production Users (PROD)
- Red banner with pulsing warning
- Maximum protection
- Destructive queries require database name
- Read-only mode encouraged for reviews

---

## Technical Implementation

### Frontend (App.jsx)
```javascript
// New state variables
const [readOnlyMode, setReadOnlyMode] = useState(false);
const [showDestructiveConfirm, setShowDestructiveConfirm] = useState(false);
const [destructiveQuery, setDestructiveQuery] = useState('');
const [confirmDbName, setConfirmDbName] = useState('');
const [queryRisk, setQueryRisk] = useState(null);

// Risk analysis function
const analyzeQueryRisk = (queryText) => {
  // Detects: destructive ops, missing WHERE, full scans, locks
  // Returns: { risks: [], severity: 'low|medium|high|critical' }
};

// Destructive query detection
const isDestructiveQuery = (queryText) => {
  // Returns true for: DROP, TRUNCATE, ALTER, DELETE without WHERE
};
```

### Styling (App.css)
- Environment banner styles (`.env-banner`)
- Read-only toggle (`.read-only-toggle`, `.toggle-switch`)
- Destructive confirmation (`.destructive-confirm`, `.critical-warning`)
- Risk analysis boxes (`.risk-analysis`, `.risk-{level}`)

---

## Testing

### Manual Test Cases

**Test 1: Environment Banner**
```bash
# Set in .env
VITE_APP_ENV=PROD
# Restart app → Should see RED banner
```

**Test 2: Read-Only Mode**
```sql
-- Enable read-only toggle
INSERT INTO test VALUES (1);
-- Should be blocked with error
```

**Test 3: Destructive Query**
```sql
DROP TABLE users;
-- Should require typing database name
```

**Test 4: DELETE without WHERE**
```sql
DELETE FROM users;
-- Should show critical warning
```

**Test 5: Normal Mutating Query**
```sql
UPDATE users SET name='test' WHERE id=1;
-- Should show standard confirmation
```

**Test 6: SELECT Query**
```sql
SELECT * FROM users;
-- Should execute immediately
```

---

## Compliance & Audit

### Logged Events
All safety-related actions are logged:
- Read-only mode toggle (ON/OFF)
- Destructive query attempts
- Confirmation dialogs shown
- User confirmations (accepted/cancelled)
- Database name verification

### Audit Trail
```json
{
  "action": "DESTRUCTIVE_QUERY_CONFIRMED",
  "user": "user@example.com",
  "query": "DROP TABLE test",
  "dbName": "production_db",
  "confirmed": true,
  "timestamp": "2026-02-19T10:30:00Z"
}
```

---

## Benefits

### Risk Reduction
- ✅ Prevents accidental data loss
- ✅ Requires explicit confirmation for dangerous operations
- ✅ Visual warnings for environment awareness
- ✅ Read-only mode for safe data review

### Compliance
- ✅ Audit trail for all destructive operations
- ✅ User confirmation records
- ✅ Environment segregation
- ✅ Access control enforcement

### User Experience
- ✅ Clear visual indicators
- ✅ Helpful risk analysis
- ✅ Non-intrusive for safe operations
- ✅ Educational (teaches safe practices)

### Production Safety
- ✅ Multiple layers of protection
- ✅ Cannot bypass critical confirmations
- ✅ Environment-aware behavior
- ✅ Session-level controls

---

## Future Enhancements (Optional)

1. **Auto-transaction Mode**: Wrap all mutating queries in BEGIN/COMMIT by default in PROD
2. **Query Approval Workflow**: Require manager approval for destructive queries
3. **Scheduled Maintenance Windows**: Only allow schema changes during approved windows
4. **Query Templates**: Pre-approved safe query patterns
5. **EXPLAIN Integration**: Show actual execution plan before running
6. **Row Count Estimation**: Estimate affected rows before execution
7. **Backup Verification**: Require recent backup before destructive operations
8. **Two-Factor Confirmation**: Require 2FA for DROP/TRUNCATE in production

---

## Support

For issues or questions:
1. Check logs in `logs/security-*.log` for safety events
2. Review `logs/activity-*.log` for user actions
3. Verify environment configuration in `.env`
4. Test in DEV environment first

---

## Summary

All production safety controls are now active:
- ✅ Environment banner (PROD/UAT/DEV)
- ✅ Read-only mode toggle
- ✅ Destructive query confirmation (requires DB name)
- ✅ Query risk analyzer
- ✅ Standard mutating query confirmation
- ✅ Full audit logging
- ✅ No breaking changes to existing functionality

**The application is now production-ready with enterprise-grade safety controls.**
