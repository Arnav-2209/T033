# Synthetic demonstration accounts

These identities are seeded for local demonstration and automated tests. They are not LNMIIT accounts and must never be used with real grievance information.

| Role                            | Demo email                               |
| ------------------------------- | ---------------------------------------- |
| Student                         | `aditi.rao@student.demo.sgrs.local`      |
| Grievance Handler               | `ramesh.kumar@staff.demo.sgrs.local`     |
| Department / Committee Reviewer | `hostel.committee@staff.demo.sgrs.local` |
| Administrator                   | `admin@demo.sgrs.local`                  |
| Institute Management            | `management@demo.sgrs.local`             |

All seeded users share the local `SGRS_SEED_PASSWORD` value in the ignored repository-root `.env`. Set a private demo-only value of at least 12 characters before running `pnpm db:seed`. The password is intentionally not copied into documentation or committed to Git. Reseeding updates seeded names, roles, departments and activation state; existing seeded password hashes are retained.

The login page's “Choose a demo account” control fills only the email field. Users still authenticate with the configured password; it does not switch roles or bypass the API.

For accounts created by an administrator, the administrator supplies the initial password and shares it through a channel outside SGRS. Invitation delivery and mandatory first-login password change have not been specified and remain open in DEC-015.
