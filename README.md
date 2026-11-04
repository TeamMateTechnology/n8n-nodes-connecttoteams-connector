# n8n-nodes-connecttoteams-connector

This is an n8n community node. It lets you send and receive SMS-style messages
through **ConnecttoTeams** in your n8n workflows.

## Who this is for

**ConnecttoTeams** lets a business's phone numbers send and
receive SMS inside Microsoft Teams: customers text a business number, and
staff read and reply in a Teams conversation. Each of those business phone
numbers is a **DID** (direct inward dialing number) — the term used throughout
this README. The **SMS Responder** is ConnecttoTeams' messaging backend; every
node in this package talks to it.

You need a ConnecttoTeams account and, for each DID you want to use from n8n,
a token issued by ConnecttoTeams (see [Authentication](#authentication)). Without a
ConnecttoTeams account these nodes have nothing to connect to.

> The nodes send to the production ConnecttoTeams SMS Responder
> (`smsbot.connecttoteams.com`).

## Nodes

The package adds **ConnecttoTeams** to n8n's node panel. Open it to see its
actions and its trigger:

| In the panel | What it does |
|--------------|--------------|
| **Message → Send an SMS** | Sends a text or picture message from one of your DIDs to a single recipient, e.g. one message per row of a Google Sheet. |
| **Message → Send a group SMS** | Sends one group text (SMS/MMS) from one of your DIDs to several recipients, as a single group conversation in Teams. |
| **Message → Relay an inbound SMS** | Delivers an inbound SMS/MMS that a customer sent to one of your DIDs into the matching Teams conversation. |
| **Delivery Status → Update a delivery status** | Reports what the carrier said happened to a message you sent (`MT_DELIVERED` / `MT_REJECTED`), so the Teams conversation shows the real delivery status. |
| **On outbound SMS from ConnecttoTeams** (the ConnecttoTeams Trigger) | Starts a workflow whenever ConnecttoTeams hands it an outgoing SMS to deliver (generic carrier), e.g. to send it through your own SMS provider. Acknowledges each message immediately with a `carrier_msg_id` and outputs a fixed set of fields. |

The four actions are operations of one node, **ConnecttoTeams** (pick them
with its **Resource** and **Operation** fields); the trigger is a separate
node. This README calls the actions **Send SMS**, **Send Group SMS**, **Relay
Inbound SMS** and **Update Delivery Status**.

Search for "ConnecttoTeams" or "SMS" in the node panel to find
them. For a step-by-step guide to each action, with screenshots, see the
[node guide](docs/nodes/README.md).

> **Upgrading from the separate nodes?** Earlier builds had four action nodes
> (Send Outbound SMS, Send Outbound Group SMS, SMS To ConnecttoTeams, Delivery
> Status Update). They were replaced by the ConnecttoTeams node's actions and
> removed, so workflows that use them show "unknown node" and must be rebuilt
> with the matching action; the fields are the same, except Send Group SMS's
> **Destination(s)** is now **Recipients**. The trigger was renamed too (from
> "SMS From ConnecttoTeams Trigger", internal type `connecttoTeamsSmsTrigger`,
> to "ConnecttoTeams Trigger", `connecttoTeamsTrigger`), so saved trigger
> workflows also show "unknown node". Changing the node's `type` in the saved
> workflow JSON fixes them and keeps their webhook URL; re-adding the trigger
> instead gives it a new URL, which the generic carrier must then be pointed at.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Authentication](#authentication)
[Compatibility](#compatibility)
[Usage](#usage)
[Support](#support)
[Resources](#resources)
[Version history](#version-history)

## Installation

This package is only installable on a **self-hosted** n8n instance — n8n Cloud
only allows community nodes that have gone through n8n's own verification
program, which this package has not (see [Compatibility](#compatibility)).

> **New to community nodes?** See n8n's
> [community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
> for the platform-level requirements n8n imposes on *any* community node
> before it'll install — self-hosted only, the Owner/Admin role requirement,
> and the risk acknowledgment. The steps below are specific to this package.

### Option A — from the Manager UI (recommended)

1. Go to **Settings → Community Nodes**.
2. Select **Install a community node**.
3. Enter the package name: `n8n-nodes-connecttoteams-connector`.
4. Check **"I understand the risks of installing unverified code from a
   public source"** — n8n shows this for every community node that isn't
   independently verified — and select **Install**.
5. Wait for the install to finish; n8n restarts its internal node registry
   automatically, no server restart needed.

> **Docker note:** in most Docker deployments, packages installed this way
> live in the container's writable layer. Unless `~/.n8n` (or wherever
> `N8N_USER_FOLDER` points) is on a persistent volume, a container
> recreation (not just a restart) can wipe the installed package — you'd
> need to reinstall it. If you manage n8n via a custom Dockerfile or
> `docker-compose.yml`, installing at build/deploy time (Option B) is more
> durable.

### Option B — pinned at deploy time (Docker/Kubernetes)

For deployments where you build n8n's image yourself, install the package
into the image so it's present on every container start, without relying on
the Manager UI or a persistent volume:

n8n loads community packages from `~/.n8n/nodes` (not from global
`node_modules`), and the `n8nio/n8n` image runs as the `node` user, so a
global `npm install -g` fails with `EACCES` and wouldn't be loaded anyway.
Install into the nodes folder instead:

```dockerfile
FROM n8nio/n8n:latest
# Replace <version> with a published version — avoid a bare install with no
# version, so a new release can't change behavior under you.
USER root
RUN mkdir -p /home/node/.n8n/nodes \
 && cd /home/node/.n8n/nodes \
 && npm install n8n-nodes-connecttoteams-connector@<version> \
 && chown -R node:node /home/node/.n8n
USER node
```

> **Verify against your n8n version** — this snippet hasn't been tested
> against every n8n image. **Caution:** if `/home/node/.n8n` is mounted as a
> volume (the usual way to persist n8n data), the volume shadows the image's
> copy and the package won't be there. In that case install via
> **Settings → Community Nodes** (Option A) or into the volume itself instead.

Use the latest version shown on the package's npm page (for example
`0.1.0`).

Community package installs are enabled by default on recent n8n versions;
if yours has it disabled, set `N8N_COMMUNITY_PACKAGES_ENABLED=true` in the
environment first.

### Verifying the install

Open the node panel (the **+** button on the canvas) and search for
"ConnecttoTeams" — you should see **ConnecttoTeams**. Open it: it lists the
four actions (Send an SMS, Send a group SMS, Relay an inbound SMS, Update a
delivery status) and the **ConnecttoTeams Trigger**. If nothing shows up, check
**Settings → Community Nodes** to confirm the package installed without
error, and see n8n's
[community node troubleshooting guide](https://docs.n8n.io/integrations/community-nodes/troubleshooting/)
if it didn't.

Once installed, set up the **ConnecttoTeams Enterprise API** credential before
using any ConnecttoTeams action, and the **ConnecttoTeams Gateway API** credential before
using the trigger — see [Authentication](#authentication) below.

## Operations

### ConnecttoTeams Trigger (receive a message)

**Prerequisite:** a phone number provisioned through ConnecttoTeams on the
**generic carrier**. In that carrier's setup, set its **Callback URL** to
this node's production webhook URL (shown in the node once you activate the
workflow) — otherwise the carrier has nowhere to deliver incoming messages
and this trigger never fires. Also set the generic carrier's **`api_secret`** (the
generic carrier's shared secret, set by ConnecttoTeams) to the same value as the
trigger's **ConnecttoTeams Gateway API** Auth Key — otherwise every request is
rejected with `401`.

Registers a `POST` webhook at the **Webhook Path** you configure (default
`connecttoteams-incoming`). The path must be unique across your active
workflows — give each trigger its own path (e.g. one per generic carrier or
DID); two active workflows on the same path conflict. Both sides of this node
are a fixed contract.

The incoming message is acknowledged **immediately**, before the workflow
runs — the carrier never waits for the rest of the workflow to finish.

**Output** — always these fields, whatever the caller posts:

| Output field     | Type       | From          | If missing |
|------------------|------------|---------------|------------|
| `source`         | string     | `source`      | `''`       |
| `destination`    | string     | `recipients`, comma-joined | `''` |
| `recipients`     | `string[]` | `destination` | `[]`       |
| `is_group`       | boolean    | `destination` sent as an array | `false` |
| `text`           | string     | `text`        | `''`       |
| `media_url`      | `string[]` | `media_url`   | `[]`       |
| `carrier_msg_id` | string     | *generated*   | always set |

`media_url` entries can arrive as plain URLs or as `{ url, fileName }`
objects — the latter is how media already hosted by ConnecttoTeams (e.g. an
image sent from Teams) is forwarded. Either way the output is a list of URL
strings, which can be mapped straight into a send node's **Media URLs**.

Phone numbers are emitted in E.164 **with** a leading `+` (e.g.
`+15553334444`): the dispatcher sends `destination` as bare digits (`source`
already has its `+`), so bare-digit values get `+` prepended; anything else is
passed through trimmed.

`recipients` is every number the message is to be delivered to — one entry
for a 1:1 message; for a group text, every participant except the sender (the
dispatcher sends `destination` as an array for groups, which also sets
`is_group` to `true`). `destination` is the same list comma-joined, so for a
1:1 message it is a single number and 1:1 workflows can keep mapping it as a
string.

`carrier_msg_id` is the same id sent in the acknowledgement, so the workflow can
correlate its own work with what the dispatcher recorded.

Because the shape is fixed, you can map `$json.source`, `$json.destination`,
`$json.recipients`, `$json.is_group`, `$json.text`, `$json.media_url` and
`$json.carrier_msg_id` in later nodes
**before the trigger has ever run**. Every request must carry `Authorization: Bearer <auth key>` matching
the trigger's **ConnecttoTeams Gateway API** credential (see
[Authentication](#authentication)); anything else is rejected with `401` and
the workflow does not start.

### ConnecttoTeams → Relay Inbound SMS (relay an inbound message)

Sends one request per input item to the SMS Responder's fixed inbound
endpoint. The request body is assembled from these fields (empty fields are
omitted):

| Field            | Body key            | Notes                                   |
|------------------|---------------------|-----------------------------------------|
| *(credential)*   | —                   | ConnecttoTeams Enterprise API credential's Access Token |
| Source           | `source`            | Sender ("from") — required              |
| Destination      | `destination`       | Recipient ("to") — required             |
| Message          | `text`              | Message body                            |
| Message ID       | `message_id`        | Optional id; stored server-side as `carrier_msg_id` |
| Media URLs       | `media_url`         | List of media links (flattened array)   |
| Group Recipients | `group_recipients`  | Optional; the *other* participants in a group conversation, any number format (flattened array) |
| —                | `timestamp`         | Set automatically (ISO 8601)            |

Leave **Group Recipients** empty for a normal 1:1 relay. Set it to route the
message into a group Teams conversation instead of a 1:1 chat. List only the
other participants, in any common format (`+14135550111`, `4135550111`,
`(413) 555-0111`): the responder normalizes them, adds the receiving DID
(**Destination**) and the sender (**Source**) itself, so the message lands in
the same Teams group conversation as an outbound group text to those numbers.
A list that leaves only the DID is treated as a 1:1 message.

Acknowledging the carrier dispatcher is the trigger's job, not this node's, so
this node can sit anywhere in the workflow.

This action supports **Continue On Fail**. The ConnecttoTeams node can be attached to an n8n AI Agent as a tool. The workflow
builder picks the action when attaching it, so an agent can only relay inbound
messages if a builder deliberately attaches this action.

**Output** on success:

```json
{ "message": "Received JSON message", "content": "RECEIVED" }
```

### ConnecttoTeams → Send SMS (send a message)

**Prerequisite:** the **Source** number must be properly configured in
the ConnecttoTeams portal before you can send with it.

Sends one request per input item to the SMS Responder's fixed outbound
endpoint. The request body is assembled from these fields (empty fields are
omitted):

| Field            | Body key            | Notes                                       |
|------------------|---------------------|---------------------------------------------|
| *(credential)*   | —                   | ConnecttoTeams Enterprise API credential's Access Token |
| Source           | `source`            | Sender ("from") — required                  |
| Destination      | `destination`       | Exactly one recipient — required; a list separated by commas, semicolons or new lines is rejected (spaces are not separators, so `(413) 414-4414` is one number) |
| Message          | `message`           | Message body                                |
| Media URLs       | `media`             | Publicly reachable image URLs, separated by commas or new lines, or an array from an expression (MMS) |

Numeric values from an expression (e.g. a phone number stored as a number in
Google Sheets) are accepted. The SMS Responder resolves the carrier from the
**source** number server-side; there are no carrier fields on the node. For
more than one recipient, use **ConnecttoTeams → Send Group SMS** below
instead. Both send actions support **Continue On Fail** and can be used as
tools by the n8n AI Agent.

**Output** on success — the stored message record (a subset shown; numbers
come back as E.164 digits without the `+`):

```json
{
  "smsr_id": 482913,
  "to": "15559876543",
  "from": "15551230000",
  "message": "Your appointment is confirmed for 3pm.",
  "action_type": "SMS",
  "direction": "outbound",
  "status": 200,
  "delivery_status": "SENT",
  "carrier_msg_id": "SM2f1c0e9a7b4d4a11b3c2d1e0f9a8b7c6",
  "created_at": "2026-10-09T15:04:05.000Z",
  "type": "broadcast_sms",
  "errors": null
}
```

The full record also has `group_name`, `group_recipients` and `images`.
`carrier_msg_id` is the carrier's id for the message — map it into
**ConnecttoTeams → Update Delivery Status**'s **Message ID** when the carrier
later reports delivery. Its format depends on the carrier.

### ConnecttoTeams → Send Group SMS (send a group message)

**Prerequisite:** same as Send SMS — the **Source** number must be
properly configured in the ConnecttoTeams portal.

Sends one request per input item to the same fixed outbound endpoint as Send
SMS, but as a group message (`msg_type: group_text`) rather than a
broadcast:

| Field            | Body key            | Notes                                       |
|------------------|---------------------|---------------------------------------------|
| *(credential)*   | —                   | ConnecttoTeams Enterprise API credential's Access Token |
| Source           | `source`            | Sender ("from") — required                  |
| Recipients       | `destination`       | Phone numbers in the group — required, at least one; a row may also hold several numbers (commas, semicolons or new lines) or an array from an expression |
| Message          | `message`           | Message body                                |
| Group Name       | `group_name`        | **Required** — the group conversation's name in Teams; each send sets it, replacing a different stored name |
| Media URLs       | `media`             | Publicly reachable image URLs, separated by commas or new lines, or an array from an expression (MMS) |

The responder adds the source number to the group automatically — list only
the other participants under **Recipients** (**Add Recipient** adds a row).

**Output** on success has the same fields as Send SMS, with
`"type": "group_text"`, `"action_type": "MMS"`, and `group_name` /
`group_recipients` (every participant, including your DID) filled in.

### ConnecttoTeams → Update Delivery Status (report what happened to a sent message)

**Purpose.** Sending a message through Send SMS / Send Group
SMS tells you it reached the carrier — it doesn't tell you whether the carrier
actually delivered it to the handset. If your carrier reports delivery
asynchronously (its own webhook, a polling job, a status feed, …), this node
is how you feed that event back into the responder so its records — and
anything built on them (delivery ticks in the Teams UI, delivery-rate
reporting, alerting on failures) — reflect reality instead of stopping at
"sent to carrier." It posts to the *same* endpoint Relay Inbound SMS uses;
the responder tells the two apart purely by the **Delivery Status** you send.

Use it to, for example: close the loop on a message that silently never
arrived (report `MT_REJECTED`, rather than leaving it ambiguous forever); build a
per-carrier or per-DID delivery-rate report from real receipts; or trigger an
alert/retry the moment a carrier reports a failure, instead of a customer
finding out first.

| Field            | Body key            | Notes                                       |
|------------------|---------------------|---------------------------------------------|
| *(credential)*   | —                   | ConnecttoTeams Enterprise API credential's Access Token |
| Source           | `source`            | Sender of the *original* message (your DID) — required; the credential is verified against this number |
| Destination      | `destination`       | Recipient of the *original* message — required |
| Message ID       | `message_id`        | **Required** — the `carrier_msg_id` returned by Send SMS / Send Group SMS for the original message (for the generic carrier, the id the ConnecttoTeams Trigger acknowledged with); it must have been sent from Source — no match = 404 error |
| Delivery Status  | `status`            | Dropdown: **Delivered (`MT_DELIVERED`)** / **Rejected (`MT_REJECTED`)** — any other value is rejected by the responder |

There's no Message or Media URLs field here — a delivery report doesn't carry
message content, only a status update against an id.

This action supports **Continue On Fail**. The ConnecttoTeams node can be attached to an n8n AI Agent as a tool. The workflow
builder picks the action when attaching it, so an agent can only report delivery
status if a builder deliberately attaches this action; receipts should come from
the carrier.

**Output** on success:

```json
{ "message": "Received JSON message", "content": "MT_DELIVERED" }
```

### Errors and Continue On Fail (all actions)

When the SMS Responder rejects a request, the node error shows the
responder's own message and the HTTP status — for example:

| HTTP  | Example message |
|-------|-----------------|
| `400` | `Missing or invalid destination phonenumber` |
| `400` | `SMS gateway rejected the credentials for … (HTTP 401): …` |
| `401` | `Unauthorized request` (wrong token for the DID) |
| `404` | `No message with message_id "x" sent from 15551230000` (Update Delivery Status) |

With **Continue On Fail** on, a failed item is output instead of stopping the
workflow:

```json
{
  "error": "No message with message_id \"x\" sent from 15551230000",
  "http_code": 404,
  "response": { "errors": "No message with message_id \"x\" sent from 15551230000" }
}
```

`http_code` and `response` are only present when the responder answered. A
network error (no response at all) gives just `{ "error": "<n8n's message>" }`,
and so do the node's own checks (e.g. more than one Destination on Send
SMS, or a missing Access Token).

## Authentication

All four actions of the **ConnecttoTeams** node (Send SMS, Send Group SMS,
Relay Inbound SMS and Update Delivery Status) require a **ConnecttoTeams Enterprise API**
credential — a single, required **Access Token** field: the token ConnecttoTeams
issued for that DID, found in the ConnecttoTeams portal. If you are an enterprise
admin, this can be requested from your reseller. If the Access Token is empty
for an item (including an expression that resolves to nothing), the node
stops with "The ConnecttoTeams Enterprise API credential has no Access Token
for this item." and sends nothing. The credential also works with n8n's own
**HTTP Request** node (it adds the same `Authorization: Bearer` header).

The **ConnecttoTeams Trigger** requires a separate **ConnecttoTeams
Gateway API** credential — a single **Auth Key** field. Set it to the
`api_secret` (the generic carrier's shared secret, set by ConnecttoTeams) of the
generic carrier whose URL points at this trigger's webhook:
the SMS Responder sends that secret as `Authorization: Bearer <api_secret>` on
every request, and the trigger rejects anything that doesn't match with `401`.

The responder checks the Access Token against the auth key on file for the
node's DID — **Source** for Send SMS, Send Group SMS and
Update Delivery Status; **Destination** for Relay Inbound SMS. That number
can be typed in any common format (`+14134144414`, `14134144414`,
`4134144414`, `(413) 414-4414`); it is normalized to E.164 before the lookup.
Whitespace around the Access Token is trimmed. The token travels as
`Authorization: Bearer <token>` (the nodes always send it that way); a raw
token without the `Bearer ` scheme is rejected with `401`.

The Access Token field supports expressions. The responder looks up the auth
key per phone number, not per enterprise, so if one workflow sends on behalf
of several DIDs, set the Access Token to an expression (e.g.
`={{ $json.token }}`) — it's resolved against each input item, same as any
other per-item node field.

## Compatibility

- Built and tested against **n8n 2.x** (`n8n-workflow` 2.12, n8n nodes API
  version 1). Older n8n versions aren't tested.
- Requires an n8n instance that supports community nodes.
- **Self-hosted only.** This package has not gone through n8n's community
  node verification program, so n8n Cloud will not allow installing it —
  Cloud only permits verified community nodes.

## Usage

**Send messages from a data source**

1. Add a source node (e.g. Google Sheets → *Get Rows*).
2. Add **ConnecttoTeams → Send an SMS** and connect it.
3. Map **Source**, **Destination**, and **Message** from the incoming
   items (the send endpoint is fixed — nothing to configure there).
4. Select (or create) a **ConnecttoTeams Enterprise API** credential with the
   responder's Access Token.

**Receive messages**

1. Add the trigger: in the node panel open **ConnecttoTeams** and choose
   **On outbound SMS from ConnecttoTeams**.
2. Select (or create) a **ConnecttoTeams Gateway API** credential whose Auth
   Key matches the generic carrier's `api_secret`.
3. Set a **Webhook Path** and activate the workflow.
4. Point the generic carrier's **Callback URL** at the node's production
   webhook URL. It is acknowledged with `{ "carrier_msg_id": "<uuid>" }` on
   arrival.
5. Map `$json.source` / `$json.destination` / `$json.text` /
   `$json.media_url` in the nodes that follow — the shape is fixed, so this works
   before the trigger has ever fired.

New to n8n? See the [Try it out](https://docs.n8n.io/try-it-out/) guide.

## Support

Found a bug, or something not working as documented? Email
**support@connecttoteams.com** with:
- The package version (`n8n-nodes-connecttoteams-connector` version shown in
  **Settings → Community Nodes**).
- Which node (ConnecttoTeams Trigger / Relay Inbound SMS / ConnecttoTeams → Send SMS / ConnecttoTeams → Send Group SMS / ConnecttoTeams → Update Delivery Status).
- What you expected vs. what happened, and any relevant error output.

Found a security vulnerability instead? Report it privately to
**support@connecttoteams.com** rather than opening a public issue.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [n8n creating nodes reference](https://docs.n8n.io/integrations/creating-nodes/overview/)

## Version history

- **0.1.0** (2026-11-03) — first public release. See
  [CHANGELOG.md](CHANGELOG.md) for details.
