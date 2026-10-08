# Sending email (verification links)

The server sends one kind of email today: the link that confirms an address.
`MAIL_DRIVER` decides what happens to it.

| Driver | What it does | Needs |
|---|---|---|
| `disabled` | Sends nothing. The app tells people email is not set up. Production default. | nothing |
| `log` | Writes the message, link included, to the server log. Development default. | nothing |
| `brevo` | Sends through Brevo. One verified sender address is enough, no domain. | `BREVO_API_KEY`, `MAIL_FROM` |
| `resend` | Sends through Resend. Needs a domain you control. | `RESEND_API_KEY`, `MAIL_FROM` |

Choosing `brevo` or `resend` without its key makes the server refuse to start,
so a missing key shows up at deploy time and not on a stranger's first sign-up.
Set the key, `MAIL_FROM` and `MAIL_DRIVER` in one save.

## Brevo, with no domain

1. Create a free account at brevo.com.
2. Senders, Domains and Dedicated IPs, then Senders, then Add a sender. Use an
   address you can read (a Gmail address works). Click the confirmation link
   Brevo emails to it.
3. SMTP and API, then API keys, then Generate a new API key.
4. In Render, Environment, set together:
   - `BREVO_API_KEY` = the key
   - `MAIL_FROM` = `CurataMed <the-verified-address>`; it must be exactly the
     address verified in step 2
   - `MAIL_DRIVER` = `brevo`
5. Sign up a test facility and check the message arrives. Mail sent from a free
   Gmail address often lands in spam; a domain of your own, with Resend or with
   Brevo's domain authentication, fixes that.
