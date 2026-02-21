# ⚒️ QueryForge - Professional Multi-Database Management Tool

Enterprise-grade database client with SAML authentication, advanced DBA tools, and comprehensive security features.

## 🎯 Key Features

### Core Functionality
- **Multi-Database Support**: PostgreSQL, MySQL, Oracle
- **SAML 2.0 Authentication**: Enterprise SSO integration
- **Advanced SQL Editor**: Multi-tab editor with syntax highlighting, formatting, and EXPLAIN
- **Object Browser**: Browse tables, views, functions, indexes, sequences, triggers
- **Results Management**: Pagination, sorting, filtering, export (Excel, CSV, JSON, SQL)
- **DBA Tools**: Session/lock monitoring, performance analysis, maintenance tools

### Phase A: Advanced DBA Features ✨ NEW
- **Emergency Mode**: One-click read-only mode and statement timeout
- **Lock Graph Visualization**: Visual blocking chain analysis
- **Maintenance Tools**: VACUUM, bloat analysis, autovacuum monitoring
- **Performance Monitor**: Top queries, unused indexes, query statistics

### Security Features
- Individual user credentials (no shared accounts)
- Session management with automatic timeouts
- Comprehensive audit logging (activity, security, errors)
- Destructive query confirmations
- Environment-specific safety controls (DEV/UAT/PROD)
- Export tracking for compliance

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL/MySQL/Oracle database
- SAML 2.0 identity provider

### Installation

```bash
# Clone repository
git clone https://github.com/deathrangerr/queryforge.git
cd queryforge

# Install dependencies
npm install

# Configure environment
cp .env.example .env
cp .env.server.example .env.server
# Edit .env and .env.server with your settings

# Configure SAML
cp saml-config.json.example saml-config.json
# Edit saml-config.json with your SAML settings

# Build frontend
npm run build

# Start server
node server.js
```

### Development Mode

```bash
# Terminal 1 - Backend
node server.js

# Terminal 2 - Frontend
npm run dev

# Access application
open http://localhost:5173
```

## 📋 PostgreSQL Setup (Required for Phase A Features)

```sql
-- Install pg_stat_statements extension
CREATE EXTENSION pg_stat_statements;

-- Grant monitoring privileges
GRANT pg_monitor TO your_dba_user;

-- Grant VACUUM privilege
GRANT VACUUM ON ALL TABLES IN SCHEMA public TO your_dba_user;

-- For emergency mode (requires elevated privileges)
ALTER USER your_dba_user WITH SUPERUSER;
-- OR
GRANT ALTER DATABASE TO your_dba_user;
```

**postgresql.conf:**
```ini
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
pg_stat_statements.max = 10000
```

**Restart PostgreSQL after configuration changes.**

## 📚 Documentation

### Getting Started
- **[Quick Start Guide](QUICK-START.md)** - Get up and running in 5 minutes
- **[User Guide](docs/user-guide.html)** - Complete end-user documentation
- **[Troubleshooting](TROUBLESHOOTING-BLANK-PAGE.md)** - Common issues and solutions

### Configuration & Deployment
- **[Configuration Guide](docs/configuration.html)** - Environment setup
- **[Deployment Guide](docs/deployment.html)** - Production deployment
- **[Authentication Setup](docs/authentication.html)** - SAML configuration

### Features & Technical Docs
- **[Database Features](docs/database.html)** - Feature documentation
- **[Phase A Features](documentation/PHASE-A-COMPLETE.md)** - Advanced DBA tools
- **[API Reference](docs/api.html)** - Backend endpoints
- **[Architecture](docs/architecture.html)** - System design

### Security & Compliance
- **[Security Policy](SECURITY.md)** - Security best practices
- **[Logging & Compliance](docs/logging.html)** - Audit trails
- **[Security Audit](documentation/SECURITY-AUDIT.md)** - Security review

### Contributing
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community standards
- **[Documentation Index](DOCUMENTATION.md)** - Full documentation list

## 🔒 Security

### Authentication
- SAML 2.0 enterprise SSO
- Individual user credentials
- Session-based authorization
- Automatic session timeouts (5 min inactivity, 60 min max)

### Authorization
- Database-native access control
- No privilege escalation
- User-level permissions enforced

### Audit Logging
- All queries logged with user and timestamp
- Security events tracked (login, logout, session kills)
- Export operations logged for compliance
- DBA actions logged (VACUUM, emergency mode, etc.)

### Data Protection
- Credentials stored in session only (never persisted)
- No sensitive data in logs
- Secure session management
- HTTPS required in production

## 🛠️ Technology Stack

### Frontend
- React 18
- Vite 5.4
- CodeMirror (SQL editor)
- sql-formatter
- xlsx, papaparse (exports)

### Backend
- Node.js + Express
- Passport-SAML
- Winston (logging)
- pg, mysql2, oracledb (database drivers)

## 📊 Project Structure

```
queryforge/
├── src/                      # Frontend source
│   ├── App.jsx              # Main application
│   ├── SQLEditor.jsx        # Multi-tab SQL editor
│   ├── ObjectBrowser.jsx    # Database object browser
│   ├── ResultsViewer.jsx    # Results with export
│   ├── DBATools.jsx         # DBA tools (Phase A)
│   └── SearchEverywhere.jsx # Global search
├── docs/                     # HTML documentation
│   ├── index.html           # Documentation home
│   ├── user-guide.html      # User guide
│   ├── api.html             # API reference
│   └── ...                  # Other docs
├── documentation/            # Markdown documentation
│   ├── PHASE-A-COMPLETE.md  # Phase A features
│   ├── ADVANCED-DBA-*.md    # DBA documentation
│   └── ...                  # Technical docs
├── logs/                     # Application logs
├── server.js                 # Backend server
├── package.json              # Dependencies
├── .env                      # Environment config
├── .env.server               # Server config
└── saml-config.json          # SAML configuration
```

## 🎯 Features by Phase

### Phase 1-2: Core Features ✅
- SQL Editor with tabs
- Object Browser (6 types)
- Basic DBA tools

### Phase 3: Query Features ✅
- Advanced results viewer
- Multiple export formats
- Row selection and filtering

### Phase 4: DBA Tools ✅
- Session monitoring
- Lock monitoring
- User management

### Phase 5: Advanced Features ✅
- Search Everywhere
- Global object search

### Phase A: Advanced DBA Tools ✅ NEW
- Emergency mode controls
- Lock graph visualization
- Maintenance tools (VACUUM, bloat)
- Performance monitoring

## 🧪 Testing

```bash
# Validate server
node --check server.js

# Build frontend
npm run build

# Run development server
npm run dev
```

## 📈 Performance

- Result limit: 10,000 rows per query
- Session timeout: 5 minutes inactivity
- Maximum session: 60 minutes
- Auto-refresh: 5 seconds (DBA tools)

## 🤝 Contributing

1. Follow existing code structure
2. Add tests for new features
3. Update documentation
4. Follow security best practices
5. Log all DBA operations

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- Fork the repository
- Create a feature branch
- Make your changes
- Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🆘 Support

- **Documentation**: See `docs/` folder
- **Issues**: [GitHub Issues](https://github.com/deathrangerr/queryforge/issues)
- **Discussions**: [GitHub Discussions](https://github.com/deathrangerr/queryforge/discussions)
- **Security**: See [SECURITY.md](SECURITY.md)

## 🎉 Status

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: February 2026

### Completion Status
- ✅ Core Features: 100%
- ✅ DBA Tools: 100%
- ✅ Advanced Features: 100%
- ✅ Phase A: 100%
- ✅ Documentation: 100%
- ✅ Security: 100%

---

**Built with ❤️ by the open-source community**
