# Database Authentication Approaches

## Current Implementation: ✅ User Credentials (RECOMMENDED for DB Client)

### How It Works:
```
User → SAML Login → Provide DB Credentials → Direct Connection
```

### Benefits:
- ✅ Users use their existing database accounts
- ✅ Full database access based on DB permissions
- ✅ No credential storage in application
- ✅ Clear accountability (DB logs show actual user)
- ✅ Works with any database
- ✅ No application-level restrictions

### Use Cases:
- **Database administration tools** ✅ (Your case)
- **Developer tools**
- **Data exploration tools**
- **Query builders**

### Security:
- SAML authentication ensures only authorized users access the tool
- Database permissions control what users can do
- No credentials stored in application
- Session-based connection management

---

## Alternative Approaches (For Different Use Cases)

### 1️⃣ Service Account with Row-Level Security (RLS)

**Best For:** Multi-tenant SaaS applications

```
User → SAML Login → Service Account → RLS Policies → User's Data Only
```

**Implementation:**
```sql
-- PostgreSQL
SET app.current_user = 'user@email.com';
CREATE POLICY user_data ON table USING (owner = current_setting('app.current_user'));

-- MySQL
SET @current_user = 'user@email.com';
CREATE VIEW user_data AS SELECT * FROM table WHERE owner = @current_user;
```

**Pros:**
- ✅ No user credentials needed
- ✅ Database-level security enforcement
- ✅ Full audit trail
- ✅ Connection pooling

**Cons:**
- ❌ Restricts data access (not suitable for admin tools)
- ❌ Performance overhead
- ❌ Complex setup

**Use Cases:**
- Document management systems
- CRM applications
- Project management tools
- Multi-tenant SaaS

**Files:** See `setup-rls.sql` and `setup-rls-mysql.sql`

---

### 2️⃣ Role-Based Service Accounts

**Best For:** Applications with defined access levels

```
User → SAML Login → Map to Role → Service Account (read-only/read-write/admin)
```

**Implementation:**
```javascript
// Map SAML user to database role
const getUserRole = (email) => {
  if (admins.includes(email)) return 'db_admin';
  if (writers.includes(email)) return 'db_writer';
  return 'db_reader';
};

// Connect with appropriate service account
const credentials = {
  db_admin: { user: 'admin_sa', password: 'xxx' },
  db_writer: { user: 'writer_sa', password: 'xxx' },
  db_reader: { user: 'reader_sa', password: 'xxx' }
};
```

**Pros:**
- ✅ Simple role management
- ✅ No individual DB accounts needed
- ✅ Connection pooling
- ✅ Clear permission boundaries

**Cons:**
- ❌ Limited flexibility
- ❌ All users in same role share permissions
- ❌ Harder to audit individual actions

**Use Cases:**
- Internal tools with 3-4 access levels
- Reporting dashboards
- Data entry applications

---

### 3️⃣ Application-Level Authorization

**Best For:** Complex permission logic

```
User → SAML Login → Service Account → Application Checks Permissions → Allow/Deny
```

**Implementation:**
```javascript
// Check permissions before query
const canExecuteQuery = (user, query) => {
  const permissions = getUserPermissions(user.email);
  if (query.includes('DELETE') && !permissions.canDelete) {
    throw new Error('No delete permission');
  }
  return true;
};
```

**Pros:**
- ✅ Flexible permission logic
- ✅ Can implement complex rules
- ✅ Easy to change permissions

**Cons:**
- ❌ Security in application layer (can be bypassed)
- ❌ Not database-enforced
- ❌ More code to maintain

**Use Cases:**
- Custom business logic
- Dynamic permissions
- Workflow-based access

---

### 4️⃣ Temporary Database Users

**Best For:** Isolated environments (NOT RECOMMENDED)

```
User → SAML Login → Create DB User → Use → Delete on Logout
```

**Implementation:**
```sql
-- Create user
CREATE USER user_firstname_abc123 WITH PASSWORD 'random_password';
GRANT SELECT ON schema.* TO user_firstname_abc123;

-- Delete on logout
DROP USER user_firstname_abc123;
```

**Pros:**
- ✅ Isolated user accounts
- ✅ Can set specific permissions

**Cons:**
- ❌ Security risk (privilege escalation)
- ❌ Performance overhead
- ❌ Database bloat
- ❌ Complex management
- ❌ Audit trail issues

**Use Cases:**
- None recommended (security concerns)

---

## Comparison Table

| Approach | Security | Performance | Audit | Complexity | Your Tool |
|----------|----------|-------------|-------|------------|-----------|
| **User Credentials** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | ✅ **BEST** |
| **RLS** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ Too restrictive |
| **Role-Based** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⚠️ If limited roles |
| **App-Level** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⚠️ If custom logic |
| **Temp Users** | ⭐ | ⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ❌ **AVOID** |

---

## Recommendation for Your Database Client

**Keep current approach (User Credentials)** because:

1. ✅ Users need full database access to browse/query
2. ✅ They already have database accounts
3. ✅ Clear accountability through DB logs
4. ✅ No credential storage
5. ✅ Simple and secure

**Only consider alternatives if:**
- You want to restrict what users can query
- You need application-level audit logs
- You want to control table access
- You're building a SaaS application (not an admin tool)

---

## Implementation Examples

### Current (User Credentials)
```javascript
// User provides credentials
const conn = await pg.Client({ 
  user: userProvidedUsername, 
  password: userProvidedPassword 
});
```

### RLS (If needed for SaaS)
```javascript
// Service account + user context
const conn = await pool.connect();
await conn.query(`SET app.current_user = '${user.email}'`);
```

### Role-Based (If needed for limited roles)
```javascript
// Map user to role
const role = getUserRole(user.email);
const conn = await pools[role].connect();
```

---

## Security Best Practices

✅ **Always:**
- Use SAML/SSO for authentication
- Use HTTPS in production
- Implement session management
- Log all database operations
- Use prepared statements
- Validate all inputs

❌ **Never:**
- Store database passwords in application
- Create database users dynamically
- Trust client-side validation
- Expose connection strings
- Skip authentication checks

---

## Questions?

**Q: Should I use RLS for my database client?**  
A: No. RLS restricts data access, which defeats the purpose of a database browser.

**Q: How do I audit user actions?**  
A: Database logs show the actual user who connected. Enable query logging in your database.

**Q: What if users don't have database accounts?**  
A: Then consider Role-Based approach with 2-3 service accounts (read-only, read-write, admin).

**Q: Is it secure to let users provide credentials?**  
A: Yes, if you don't store them. Session-based connections are secure with HTTPS.
