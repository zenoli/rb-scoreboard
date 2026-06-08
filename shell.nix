{ pkgs ? import <nixpkgs> {} }:

let
  backendUrl = "http://localhost:8000";

  start-backend = pkgs.writeShellScriptBin "start-backend" ''
    echo "Starting backend on ${backendUrl} ..."
    cd "$BACKEND_DIR"
    exec "$BACKEND_DIR/.venv/bin/uvicorn" app.main:app --reload --host 0.0.0.0 --port 8000
  '';

  start-frontend = pkgs.writeShellScriptBin "start-frontend" ''
    echo "Starting frontend..."
    cd "$FRONTEND_DIR"
    exec npm run dev
  '';

  db-migrate = pkgs.writeShellScriptBin "db-migrate" ''
    echo "Running migrations..."
    cd "$BACKEND_DIR"
    exec "$BACKEND_DIR/.venv/bin/alembic" upgrade head
  '';

  db-reset = pkgs.writeShellScriptBin "db-reset" ''
    echo "Resetting database..."
    rm -f "$BACKEND_DIR/scoreboard.db"
    cd "$BACKEND_DIR"
    "$BACKEND_DIR/.venv/bin/alembic" upgrade head
    echo "Done. Start the backend to reseed scoring rules."
  '';

  mkSyncScript = target: pkgs.writeShellScriptBin "sync-${target}" ''
    exec ${pkgs.curl}/bin/curl -s -X POST "${backendUrl}/admin/sync/${target}" \
      -H "x-admin-key: ''${ADMIN_API_KEY:-change-me-in-production}" | ${pkgs.jq}/bin/jq .
  '';

  sync-teams     = mkSyncScript "teams";
  sync-fixtures  = mkSyncScript "fixtures";
  sync-events    = mkSyncScript "events";
  sync-positions = mkSyncScript "positions";

  db-ui = pkgs.writeShellScriptBin "db-ui" ''
    echo "Starting sqlite-web at http://localhost:8080 ..."
    exec ${pkgs.sqlite-web}/bin/sqlite_web "$BACKEND_DIR/scoreboard.db" --host 0.0.0.0 --port 8080
  '';

  sync-all = pkgs.writeShellScriptBin "sync-all" ''
    echo "Syncing all targets..."
    for target in event_types teams fixtures; do
      echo "  -> $target"
      ${pkgs.curl}/bin/curl -s -X POST "${backendUrl}/admin/sync/$target" \
        -H "x-admin-key: ''${ADMIN_API_KEY:-change-me-in-production}" | ${pkgs.jq}/bin/jq .
    done
  '';
in
pkgs.mkShell {
  buildInputs = [
    pkgs.python3
    pkgs.nodejs
    pkgs.jq
    pkgs.curl
    start-backend
    start-frontend
    db-migrate
    db-reset
    sync-teams
    sync-fixtures
    sync-events
    sync-positions
    sync-all
    db-ui
    pkgs.sqlite-web
  ];

  shellHook = ''
    export BACKEND_DIR="$PWD/backend"
    export FRONTEND_DIR="$PWD/frontend"
    export PYTHONPATH="$BACKEND_DIR"
    export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:$LD_LIBRARY_PATH"

    if [ ! -d "$BACKEND_DIR/.venv" ]; then
      echo "Creating backend venv..."
      python3 -m venv "$BACKEND_DIR/.venv"
      "$BACKEND_DIR/.venv/bin/pip" install -e "$BACKEND_DIR[dev]" -q
    fi
  '';
}
