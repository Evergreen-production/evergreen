# Running the Keeper

Build the workspace, set `EVERGREEN_SECRET_KEY`, and start `@evergreen/keeper` with a reviewed configuration. The included Compose file mounts configuration and persistent SQLite data into the keeper container.

Run the service under a supervisor, protect the status API with `EVERGREEN_KEEPER_API_TOKEN`, monitor its health endpoint, back up the database, and alert on repeated cycle errors or a low signer balance.
