# Data inventory: what BattleKrypt keeps, why, who can see it, and for how long

This is the plain-words list the Privacy Policy and Terms should be written from. The retention
periods marked **(config)** are set in `lib/retention.ts` and enforced by the daily job
(`/api/cron/data-retention`); change them there, then update this table. A deleted account is
handled by `lib/services/account-deletion.ts` and the 14-day process described in the last section.

These are starting values, not legal advice. Have a lawyer or accountant confirm the financial and
consent periods for the places you operate.

| Data | Why we hold it | Who can see it | How long | How it is removed |
|---|---|---|---|---|
| **Account**: email, display name, phone | Sign in, contact, accountability | The person; admins with Users | While the account exists | Account deletion (details removed, sign-in deleted) |
| **Player profile**: name, birth date or age, mobile, city/region/country, gender, hobbies, favourite games, username, guardian email (minors) | Run tournaments, age rules, find players | The person; hosts of events they enter (as needed); admins | While the account exists | Account deletion |
| **Guardian consent record**: guardian email, name they typed, IP address, browser, waiver text | Proof a parent or guardian agreed for a minor | Admins with Approvals; the guardian via their private link | Unanswered requests: personal details removed **90 days** after the link expires. Answered: kept for **3 years** after consent ends (expiry, revoke or decision, whichever is latest), then who signed is removed and only the fact and dates remain **(config)** | Daily job; account deletion removes it at once |
| **Student ID photo and student ID number** | Verify a student for institution-only events | The host institute and admins with Institutions (every admin view is logged); never public | Deleted **90 days** after the last event that used it closed (never while an entry is live), or **90 days** after the card's expiry date, or **90 days** after upload if never used **(config)**. The player can also remove it any time (not while an entry is live) | Daily job; the player; account deletion |
| **Organizer identity documents** (NIC or passport photos, selfie) | Verify an organizer before they handle entry fees | Admins with Organizer trust (every view is logged); never public | Photos are deleted once the organizer has built a track record, or at the latest after the retention period set in the organizer trust settings; an admin can place a hold | Existing identity job; account deletion |
| **Verified organizer details**: verified name, ID number and address (encrypted) | So a scam can be reported to the authorities | Admins with Organizer trust | **Kept after the photos are deleted** (see the open question in the delivery notes) | Currently removed by account deletion |
| **Payment screenshots on entries**, and the transaction ID typed with them | Let the organizer confirm a payment; settle disputes | The person who paid; the organizer's team and any co-host the entry was routed to; admins with Approvals; always through a short-lived private link | Screenshot: **12 months** after the event closed, never while a dispute is open **(config)**. The typed transaction ID stays with the entry record | Daily job; account deletion removes the person's own screenshots |
| **Plan, club-fee and invoice payment proofs** | Confirm what a person paid the platform | The person; admins with Payments (or Approvals for club fees) | Rejected: **12 months**. Invoices and approved plan payments: **6 years** (tax records) **(config)** | Daily job; kept through account deletion until the 6 years pass |
| **Dispute evidence** (payment disputes and challenge disputes) | Let an admin decide fairly | The two sides of the case; admins with Approvals | **12 months** after the case is resolved, never while a refund is still owed **(config)** | Daily job; account deletion removes the person's own files |
| **Challenge match screenshots and payout receipts** | Prove a win or a payout | The poster and the challenger of that entry; admins with Approvals | **12 months** after the entry finished, never while a dispute is open **(config)**. Payout details are erased as soon as the challenge finishes | Daily job; account deletion |
| **Ledger expense receipts and tax payment slips** | Business accounts and tax records | Admins with the Ledger permission only | **6 years** **(config)** | Daily job |
| **Donations**: amount, payment screenshot, transaction ID, optional message | Record money given to the community fund | The donor; admins with Donations | Record and screenshot: **6 years** (accepted money) **(config)**. The donor's message is removed when their account is deleted | Daily job; account deletion removes the message |
| **Organizer ratings**: stars and comment | Organizer credibility | The player who gave it; admins with Organizations (not shown to the public yet) | Kept | Account deletion removes the comment and keeps the stars |
| **Sponsor ad views and clicks**: a count per banner per day. No account, IP address or device is stored | Show advertisers how their banner performed | Admins with Ads | Kept with the banner until an admin deletes it | Nothing personal, so nothing to erase |
| **Google AdSense** (only if switched on): Google may set its own cookies in the visitor's browser | Earn money from free-plan pages | Google | Controlled by Google | Not shown in the EU, UK or Switzerland until an admin confirms a consent message is live. Name it in the Privacy Policy before switching on |
| **Site feedback**: message, kind, page address (no query string), and an email only if the sender typed one (signed-in senders are linked by account) | Hear feature ideas and problems | Admins with Feedback | Kept until an admin deletes it (a sender can ask for removal) | Account deletion unlinks the sender and removes the email; the message stays. An admin can delete any message |
| **Giveaway entries** | Draw the winners fairly | Admins with Giveaways; the host sees how many entered, not who | Kept with the giveaway | Account deletion removes a person's entries into giveaways that haven't been drawn |
| **Giveaway winners' delivery details**: name, phone, address, notes | Get the prize to the winner | The winner; the organizer who runs that giveaway; admins with Giveaways | **60 days** after the prize is confirmed received, or after the winner was replaced or the giveaway cancelled. **180 days** after it was sent if never confirmed **(config)**. Whether it was delivered stays | Daily job; account deletion removes them at once |
| **Payment records, invoices, ledger entries, admin action log, bans** | Accounting, tax, audit trail, stopping repeat abuse | Admins with the matching permission | Kept (financial records at least the 6 years above) | Not deleted with an account; they stay tied to an anonymous "Deleted user" |
| **Duplicate-check fingerprints** (a hash of a screenshot, never the picture) | Flag the same payment proof used twice | Reviewers see only a "duplicate" flag, never who else used it | **24 months** **(config)** | Daily job |
| **Notifications** | Tell people what changed | The person | Read: **90 days**. Unread: **365 days** **(config)** | Daily job; account deletion |
| **Visit data** (IP address, browser, city) | Traffic and abuse monitoring | Admins with Traffic | **90 days**, then removed from the visit | Existing daily job; account deletion unlinks it |
| **Tournament results, ratings, team history** | The competitive record | Public on profiles and tournament pages | Kept | After account deletion they remain under "Deleted player" |

## Files and who can open them

Payment screenshots (entries, plans, invoices, club fees), ID photos, challenge files, dispute evidence and expense receipts sit in
**private** storage. Donation screenshots and tax payment slips are private too. Nobody opens a file by its link: the server first checks who is asking
(`lib/services/proof-access.ts`) and then hands out a link that works for 5 minutes. Only logos,
banners, branding images, carousel slides and avatars are public.

## Account deletion

A person can ask for deletion on the Account & privacy page. They have **14 days** to cancel, and
we email them when they ask and when it is done. It is refused while something is open (a dispute,
a refund owed, a live event or entry, a club roster, unpaid invoices, a challenge in progress, a
prize in dispute, a giveaway prize they won that isn't finished, giveaways their organization still owes, or a staff role). On the day, their files and personal details are removed and
the sign-in account is deleted. The record stays as "Deleted user" so history and accounts still
add up; financial records, bans and the audit log are kept without their name.
