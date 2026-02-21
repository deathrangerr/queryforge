# Contributing to QueryForge

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/queryforge.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes
6. Commit: `git commit -m "Add: your feature description"`
7. Push: `git push origin feature/your-feature-name`
8. Open a Pull Request

## Development Setup

```bash
npm install
cp .env.example .env
cp .env.server.example .env.server
cp saml-config.json.example saml-config.json
npm run dev
```

## Code Guidelines

- Follow existing code structure and style
- Add comments for complex logic
- Update documentation for new features
- Ensure security best practices
- Test thoroughly before submitting

## Pull Request Process

1. Update README.md with details of changes if needed
2. Update documentation in `docs/` folder
3. Ensure all tests pass
4. Request review from maintainers

## Reporting Issues

- Use GitHub Issues
- Provide clear description
- Include steps to reproduce
- Add screenshots if applicable
- Specify environment details

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow project guidelines

## Questions?

Open an issue or discussion on GitHub.
