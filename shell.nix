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

  run-prod = pkgs.writeShellScriptBin "run-prod" ''
    set -e
    echo "Building production bundle (localhost)..."
    nix build .#local --out-link /tmp/rb-scoreboard-local

    if [ -f "$PWD/.env" ]; then
      set -a; source "$PWD/.env"; set +a
    fi

    export DATABASE_URL="''${DATABASE_URL:-sqlite+aiosqlite:////$PWD/backend/scoreboard.db}"
    export JWT_SECRET="''${JWT_SECRET:-dev-jwt-secret}"
    export ADMIN_API_KEY="''${ADMIN_API_KEY:-change-me-in-production}"

    echo "Running migrations..."
    /tmp/rb-scoreboard-local/bin/rb-scoreboard-migrate

    echo "Starting backend on http://localhost:8000, frontend on http://localhost:9400 ..."
    exec /tmp/rb-scoreboard-local/bin/rb-scoreboard
  '';

  statsTheme = pkgs.writeText "stats-theme.html" ''
    <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #1a1a2e;
      background: #f8f9fc;
      margin: 0;
      padding: 32px 48px;
    }
    h1 { font-size: 1.7em; color: #16213e; margin-bottom: 4px; }
    h2 { font-size: 1.25em; color: #16213e; margin-top: 2em; margin-bottom: 8px;
         border-bottom: 2px solid #e94560; padding-bottom: 4px; }
    h3 { font-size: 1.05em; color: #16213e; }
    em { color: #555; }
    table {
      border-collapse: collapse;
      width: auto;
      margin-bottom: 28px;
      background: #fff;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.10);
    }
    thead tr { background: #16213e; color: #fff; }
    th {
      padding: 9px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 0.95em;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    td {
      padding: 6px 10px;
      border-bottom: 1px solid #e8ecf3;
      word-break: break-word;
    }
    tbody tr:nth-child(odd)  { background: #f4f6fb; }
    tbody tr:nth-child(even) { background: #ffffff; }
    tbody tr:last-child td   { border-bottom: none; }
    tbody tr:hover           { background: #dde6f7; transition: background 0.1s; }
    td:first-child, th:first-child { width: 44px; text-align: right; color: #888; }
    strong { color: #e94560; }
    blockquote {
      border-left: 3px solid #e94560;
      margin: 0 0 20px 0;
      padding: 8px 14px;
      background: #fff0f3;
      color: #555;
      font-style: italic;
      border-radius: 0 4px 4px 0;
    }
    hr { border: none; border-top: 1px solid #dde3ec; margin: 32px 0; }
    @media print {
      body { background: #fff; padding: 0; font-size: 11px; }
      table { box-shadow: none; border: 1px solid #ccc; }
      tbody tr:hover { background: inherit; }
    }
    </style>
  '';

  stats-pdf = pkgs.writeShellScriptBin "stats-pdf" ''
    set -e
    for f in "$PWD/stats/"*.md; do
      out="''${f%.md}.pdf"
      tmp=$(mktemp /tmp/stats-XXXXXX.html)
      echo "Converting $(basename "$f") -> $(basename "$out") ..."
      ${pkgs.pandoc}/bin/pandoc "$f" -o "$tmp" --standalone --include-in-header=${statsTheme} \
        --metadata title="$(basename ''${f%.md})"
      ${pkgs.wkhtmltopdf}/bin/wkhtmltopdf --quiet --print-media-type --orientation Landscape "$tmp" "$out"
      rm "$tmp"
    done
    echo "Done."
  '';

  stats-preview = pkgs.writeShellScriptBin "stats-preview" ''
    set -e
    if [ -n "$1" ]; then
      files=("$1")
    else
      files=("$PWD/stats/"*.md)
    fi
    for f in "''${files[@]}"; do
      tmp=$(mktemp /tmp/stats-preview-XXXXXX.html)
      ${pkgs.pandoc}/bin/pandoc "$f" -o "$tmp" --standalone --include-in-header=${statsTheme} \
        --metadata title="$(basename ''${f%.md})"
      xdg-open "$tmp"
    done
  '';

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
    run-prod
    db-ui
    stats-pdf
    stats-preview
    pkgs.sqlite-web
    pkgs.pandoc
    pkgs.wkhtmltopdf
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
