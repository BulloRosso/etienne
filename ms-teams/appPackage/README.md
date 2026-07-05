# Teams App Package (bot installation into a team)

The Azure Bot "Microsoft Teams" channel alone only enables **personal** chats.
To @-mention the bot **inside a channel** (e.g. so team members can address an
observer project like `teams-comms-observer`), the bot must be installed into
the team via a Teams app package built from this folder.

## Build the package

1. Edit `manifest.json` and replace **both** occurrences of
   `REPLACE_WITH_MICROSOFT_APP_ID` with your Azure Bot's Microsoft App ID
   (the same value as `MICROSOFT_APP_ID` in `ms-teams/.env`).
2. Ensure `color.png` (192×192) and `outline.png` (32×32) exist next to the
   manifest — placeholder icons are checked in; replace them with branding
   as desired.
3. Zip the three files **flat** (no containing folder):

   ```bash
   cd ms-teams/appPackage
   zip etienne-teams.zip manifest.json color.png outline.png
   ```

## Install into a team

1. In Microsoft Teams: **Apps → Manage your apps → Upload an app →
   Upload a custom app** and select `etienne-teams.zip`.
   (If custom app upload is disabled, a Teams admin must allow it under
   Teams admin center → Teams apps → Setup policies, or upload the app
   tenant-wide via the admin center.)
2. Choose **Add to a team** and pick the team/channel the bot should join.
3. In the channel, mention the bot: `@Etienne /start` — this triggers the
   pairing flow in the Etienne web UI (admin approves, then binds a project
   with `@Etienne project 'project-name'`).

Notes:

- In channels the bot only receives messages in which it is @-mentioned.
  All other channel traffic is invisible to the bot (channel *observation*
  is done separately via Microsoft Graph — see `ms-teams-integration.md`).
- One pairing covers the whole channel: thread suffixes
  (`;messageid=...`) are normalized away, so every thread in the channel
  maps to the same Etienne project session.
- Replies are posted into the thread the mention came from.
