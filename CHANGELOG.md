# Changelog

All notable changes to `n8n-nodes-connecttoteams-connector`.

<!-- Add every change under [Unreleased] in the same change that makes it. -->

## [Unreleased]

## [0.1.1] - 2026-11-04

### Fixed
- First version published to npm. 0.1.0 was tagged but never reached npm:
  its publish failed because the package wasn't marked public, which npm
  requires to attach provenance to a new package.

## [0.1.0] - 2026-11-03

### Added
- First public release.
- Nodes: **ConnecttoTeams**, one node whose actions are Send SMS, Send Group
  SMS, Relay Inbound SMS (Message) and Update Delivery Status (Delivery
  Status), so n8n's node panel lists them under one ConnecttoTeams entry; and
  **ConnecttoTeams Trigger**, listed in the same panel.
- Credentials: ConnecttoTeams Enterprise API (the ConnecttoTeams node) and
  ConnecttoTeams Gateway API (trigger).

### Changed
- The four separate action nodes of earlier internal builds (Send Outbound
  SMS, Send Outbound Group SMS, SMS To ConnecttoTeams, Delivery Status Update)
  were merged into the ConnecttoTeams node and removed. Workflows that used
  them must be rebuilt with the matching action; Send Group SMS's
  Destination(s) field is now Recipients. The trigger was renamed from "SMS
  From ConnecttoTeams Trigger" (`connecttoTeamsSmsTrigger`) to "ConnecttoTeams
  Trigger" (`connecttoTeamsTrigger`) so n8n lists it in the ConnecttoTeams
  panel; saved trigger workflows need their node type changed (their webhook
  URLs stay the same when the type is edited in place).
- Multi-row fields show **Add Recipient** / **Add Media URL** buttons.

### Notes
- The nodes call the production SMS Responder (`smsbot.connecttoteams.com`).
