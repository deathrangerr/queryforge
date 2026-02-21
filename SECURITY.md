# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via:
- GitHub Security Advisories (preferred)
- Email to project maintainers

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- Initial response: Within 48 hours
- Status update: Within 7 days
- Fix timeline: Depends on severity

## Security Best Practices

When using this application:

1. **Never commit sensitive data**
   - Use `.env` files (not tracked in git)
   - Keep `saml-config.json` private
   - Rotate credentials regularly

2. **Production deployment**
   - Use HTTPS only
   - Enable session security
   - Configure proper CORS
   - Use strong session secrets
   - Enable audit logging

3. **Database access**
   - Use least-privilege accounts
   - Never share credentials
   - Enable database audit logs
   - Use read-only mode when possible

4. **SAML configuration**
   - Validate certificates
   - Use secure callback URLs
   - Enable signature verification
   - Configure proper session timeouts

## Known Security Considerations

- Credentials stored in session memory only (not persisted)
- All queries logged with user attribution
- Session timeouts enforced (5 min inactivity, 60 min max)
- Destructive operations require confirmation
- Export operations tracked for compliance
