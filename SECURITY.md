# Security Policy

## Reporting a vulnerability

If you find a security issue in this package — including but not limited to
credential handling, the Bearer token flow or the trigger's gateway Auth Key
check described in the
[Authentication](README.md#authentication) section of the README, or anything
that could let one enterprise's traffic reach another's DID — please report it
privately rather than opening a public GitHub issue or npm advisory first.

**Contact:** support@connecttoteams.com

Please include:
- A description of the issue and its potential impact.
- Steps to reproduce, or a proof of concept if you have one.
- The package version(s) affected.

## What to expect

- We'll acknowledge your report within a few business days.
- We'll keep you updated as we investigate and work on a fix.
- Once a fix is released, we'll credit you in the release notes if you'd
  like (or keep you anonymous, if you'd prefer).

Please give us a reasonable window to ship a fix before disclosing publicly.

## Supported versions

This package does not yet have a formal multi-version support policy —
security fixes are released against the latest version on npm.

## Scope

This repository is the n8n community node client — it holds no SMS
Responder business logic itself. Its action nodes forward a user-supplied
Bearer token to the SMS Responder for authentication, and its trigger checks
the incoming `Authorization: Bearer` header against its gateway Auth Key
before starting a workflow. Vulnerabilities in the SMS
Responder backend itself should be reported to ConnecttoTeams support
through the same contact.
