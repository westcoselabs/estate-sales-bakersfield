# Super-admin provisioning and recovery

Provision only during an approved maintenance window after the super-admin
migration is deployed. The target must already be an active, verified account.
Use its exact UUID, normalized email, application environment, and database
resource environment:

```text
pnpm admin:provision --user=<uuid> --email=<normalized-email> --environment=<environment> --resource=<database-resource-environment>
```

The command refuses noninteractive input, securely prompts for the account's
existing password, locks provisioning, refuses a different existing owner,
revokes all target sessions, and writes `SUPER_ADMIN_PROVISIONED`. Re-running it
for the same already-provisioned account is idempotent.

After provisioning, sign in fresh and verify Overview, Users, and Listings.
Confirm ordinary users receive the safe not-found experience and anonymous
requests redirect to login without retaining admin query parameters.

Normal password reset is the owner recovery path. If mailbox access is lost,
stop and use a controlled provider/database operator procedure with an approved
incident record and backup. Do not add a public recovery route, change the sole
owner directly without review, delete payment history, or disable append-only
audits.

For rollback, use forward migrations. Do not rename the role or remove the
singleton constraint while a `SUPER_ADMIN` value is in use. Do not weaken
consent, restriction, removal, or terminal-lifecycle constraints to bypass
inconsistent production data.
