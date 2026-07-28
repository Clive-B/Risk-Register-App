# NCA GRC corporate mail deployment handover

## Purpose

This document tells NCA IT how to connect the NCA Enterprise GRC Platform to the Authority's existing corporate Outlook/Exchange mail system. The application package contains no NCA mail-server password or private infrastructure value. NCA IT supplies those values during deployment.

The application sends only to official `@nca.org.gh` recipients and requires an approved `@nca.org.gh` sender.

## 1. Choose the approved connection method

NCA IT must select one of these supported methods:

### A. NCA SMTP relay

Use this when the application server is permitted to relay by server identity or allowlisted IP address.

- Supply the relay hostname and port.
- Allow the production application server's fixed outbound IP.
- Leave both `SMTP_USER` and `SMTP_PASSWORD` blank.
- Require STARTTLS or TLS.
- Restrict the relay to the approved NCA sender and NCA recipients.

### B. Dedicated authenticated SMTP account

Use this when NCA provides a dedicated GRC service mailbox/account.

- Supply the SMTP hostname and port.
- Supply both `SMTP_USER` and `SMTP_PASSWORD`.
- Enable SMTP submission for that dedicated account.
- Do not use a staff member's personal mailbox or password.
- Require STARTTLS or TLS.

The current release does not send mail through Microsoft Graph or OAuth 2.0. If NCA policy permits only Graph/OAuth, stop deployment and record that integration as a required application change.

## 2. Values IT must prepare

| Setting | Required decision |
|---|---|
| Application URL | Approved HTTPS address, for example `https://grc.nca.org.gh` |
| SMTP host | NCA relay or Exchange/Outlook SMTP hostname |
| SMTP port | Port supplied by IT |
| Encryption | STARTTLS or implicit TLS |
| Authentication | Approved relay or dedicated service account |
| Sender name | Recommended: `NCA Enterprise GRC` |
| Sender address | Approved address ending in `@nca.org.gh` |
| Test recipient | IT-controlled `@nca.org.gh` mailbox |
| Server firewall | Permit outbound traffic from the application server to the mail host/port |
| Relay controls | Sender, recipient, IP and rate restrictions |
| Mail controls | Quarantine, anti-spam, throttling and mailbox limits |

## 3. Configure the production environment

Copy `backend/.env.production.example` to `backend/.env`. Replace all placeholder values and restrict the file ACL to administrators and the NCA GRC Windows service account.

Authenticated SMTP example:

```dotenv
SMTP_HOST=mail-host-supplied-by-nca-it
SMTP_PORT=587
SMTP_USER=dedicated-account-supplied-by-nca-it
SMTP_PASSWORD=protected-secret-supplied-by-nca-it
SMTP_FROM=NCA Enterprise GRC <approved-sender@nca.org.gh>
SMTP_SECURE=false
SMTP_ALLOW_SELF_SIGNED=false
DISABLE_COMMUNICATION_WORKER=false
```

Approved relay example:

```dotenv
SMTP_HOST=relay-host-supplied-by-nca-it
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=NCA Enterprise GRC <approved-sender@nca.org.gh>
SMTP_SECURE=false
SMTP_ALLOW_SELF_SIGNED=false
DISABLE_COMMUNICATION_WORKER=false
```

`SMTP_SECURE=false` selects STARTTLS. Set it to `true` only when NCA IT explicitly requires implicit TLS. Do not disable certificate validation without a documented security exception.

## 4. Run the deployment gate

From the `backend` directory:

```powershell
npm ci --omit=dev
npm test
npm run migrate
npm run readiness
```

The readiness result must show:

```json
{
  "ready": true,
  "environment": "production",
  "smtp": "verified"
}
```

Do not approve go-live when SMTP is skipped, unconfigured or failed.

## 5. Perform the Outlook acceptance test

1. Start the `NcaGrcApi` Windows service.
2. Sign in as a System Administrator.
3. Open **Administration · Communication Centre → SMTP Settings**.
4. Confirm the configured host, port, sender and encryption mode.
5. Enter an approved NCA test recipient.
6. Select **Verify and Send Test**.
7. Confirm the status changes to **Healthy**.
8. Confirm receipt in the Outlook inbox.
9. Confirm the message did not enter Junk Email or quarantine.
10. Confirm the displayed sender and reply behaviour meet NCA policy.

## 6. Test application-generated messages

Use test accounts and verify each of the following:

- new-user welcome email;
- password-reset email and single-use reset link;
- password-changed confirmation;
- risk assignment and submission notification;
- Champion and Committee approval notification;
- treatment assignment, due-date reminder and escalation;
- scheduled governed report;
- failed-message retry from the Communication Centre.

Confirm links use the production HTTPS GRC address and never `localhost`.

## 7. Failure and recovery test

1. In a controlled test window, temporarily block the test route or use a non-routable test configuration approved by IT.
2. Confirm the email remains in the queue or moves to Failed.
3. Confirm retry count and error information are visible to the administrator.
4. Restore the approved configuration.
5. Retry the message.
6. Confirm the message is accepted and received.

The worker must remain enabled in production:

```dotenv
DISABLE_COMMUNICATION_WORKER=false
```

## 8. Security and operational controls

- Use a dedicated service identity or constrained relay.
- Never commit `backend/.env`.
- Keep `JWT_SECRET` and `COMMUNICATION_ENCRYPTION_KEY` different and at least 32 characters.
- Back up `COMMUNICATION_ENCRYPTION_KEY` through the approved secrets process; changing or losing it makes saved SMTP credentials and queued payloads unreadable.
- Restrict access to SMTP Settings and Communication Centre to System Administrators.
- Review failed and exhausted deliveries.
- Apply NCA password/secret rotation procedures.
- Re-run `npm run readiness` after mail-host, certificate, credential or firewall changes.

## 9. Delivery-status interpretation

**Sent** means that the configured NCA SMTP server accepted the message. Outlook inbox arrival must be confirmed during acceptance testing. The application cannot independently prove mailbox delivery through standard SMTP alone.

## 10. Sign-off record

Record the following in the deployment change ticket:

- production application URL;
- selected SMTP method: relay or authenticated account;
- mail host and port, without recording the password;
- approved sender;
- application-server IP;
- TLS mode and certificate result;
- readiness-check date and operator;
- test-message ID and recipient;
- Outlook receipt confirmation;
- quarantine result;
- application-message test results;
- NCA IT approver and application owner;
- rollback contact and escalation route.
