{ ... }:
{
  perSystem =
    { pkgs, self', ... }:
    let
      python = pkgs.python312;

      backend = python.pkgs.buildPythonApplication {
        pname = "rb-scoreboard-backend";
        version = "0.1.0";
        pyproject = true;

        src = ../backend;

        build-system = [ python.pkgs.setuptools ];

        dependencies = with python.pkgs; [
          fastapi
          uvicorn
          sqlalchemy
          aiosqlite
          alembic
          pydantic
          pydantic-settings
          email-validator
          httpx
          bcrypt
          python-jose
          cryptography
          apscheduler
          python-multipart
          aiofiles
          networkx
        ];

        doCheck = false;

        meta = {
          description = "RB Scoreboard backend";
          mainProgram = "uvicorn";
        };
      };

      frontend = pkgs.buildNpmPackage {
        pname = "rb-scoreboard-frontend";
        version = "0.1.0";
        src = ../frontend;

        # Run `nix build .#frontend` once to get the correct hash from the error output.
        npmDepsHash = "sha256-JTjqiLu2ySrZBbF2z5wsNTjZGWJcsoIBNqrPPiDT0XA=";

        # Empty string → relative URLs; Next.js rewrites proxy API calls to backend
        env.NEXT_PUBLIC_API_URL = "";

        installPhase = ''
          runHook preInstall
          cp -rT .next/standalone $out
          cp -r .next/static $out/.next/static
          if [ -d public ]; then cp -r public $out/public; fi
          runHook postInstall
        '';

        meta.description = "RB Scoreboard frontend (standalone)";
      };

      mkApp = { frontend, backendPort ? "8000", frontendPort ? "3000" }:
        let
          node = pkgs.nodejs;
          wrapper = pkgs.writeShellScript "rb-scoreboard" ''
            BACKEND_PORT="''${BACKEND_PORT:-${backendPort}}"
            FRONTEND_PORT="''${FRONTEND_PORT:-${frontendPort}}"

            cleanup() { kill 0 2>/dev/null; }
            trap cleanup EXIT

            PORT="$FRONTEND_PORT" HOSTNAME=0.0.0.0 ${node}/bin/node @frontend@/server.js &

            exec ${backend}/bin/uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT"
          '';
          migrateWrapper = pkgs.writeShellScript "rb-scoreboard-migrate" ''
            cd @share@
            exec ${backend}/bin/alembic upgrade head
          '';
        in
        pkgs.stdenv.mkDerivation {
        pname = "rb-scoreboard";
        version = "0.1.0";
        dontUnpack = true;

        installPhase = ''
          mkdir -p $out/bin $out/share/rb-scoreboard

          cp -r ${frontend} $out/share/rb-scoreboard/frontend
          cp -r ${../backend/alembic} $out/share/rb-scoreboard/alembic
          cp ${../backend/alembic.ini} $out/share/rb-scoreboard/alembic.ini

          substitute ${wrapper} $out/bin/rb-scoreboard \
            --replace-fail "@frontend@" "$out/share/rb-scoreboard/frontend"
          chmod +x $out/bin/rb-scoreboard

          substitute ${migrateWrapper} $out/bin/rb-scoreboard-migrate \
            --replace-fail "@share@" "$out/share/rb-scoreboard"
          chmod +x $out/bin/rb-scoreboard-migrate
        '';

        meta = {
          description = "RB Scoreboard - sports scoring application";
          mainProgram = "rb-scoreboard";
        };
      };
    in
    {
      packages = {
        inherit backend frontend;

        default = mkApp { inherit frontend; };
        local = mkApp {
          inherit frontend;
          frontendPort = "9400";
        };
      };
    };
}
