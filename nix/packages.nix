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
        ];

        doCheck = false;

        meta = {
          description = "RB Scoreboard backend";
          mainProgram = "uvicorn";
        };
      };

      mkFrontend = apiUrl: pkgs.buildNpmPackage {
        pname = "rb-scoreboard-frontend";
        version = "0.1.0";
        src = ../frontend;

        # Run `nix build .#frontend` once to get the correct hash from the error output.
        npmDepsHash = "sha256-JTjqiLu2ySrZBbF2z5wsNTjZGWJcsoIBNqrPPiDT0XA=";

        env.NEXT_PUBLIC_API_URL = apiUrl;

        installPhase = ''
          runHook preInstall
          cp -r out $out
          runHook postInstall
        '';

        meta.description = "RB Scoreboard frontend";
      };

      mkApp = frontend: pkgs.stdenv.mkDerivation {
        pname = "rb-scoreboard";
        version = "0.1.0";
        dontUnpack = true;

        installPhase = ''
          mkdir -p $out/bin $out/share/rb-scoreboard

          cp -r ${frontend} $out/share/rb-scoreboard/static
          cp -r ${../backend/alembic} $out/share/rb-scoreboard/alembic
          cp ${../backend/alembic.ini} $out/share/rb-scoreboard/alembic.ini

          cat > $out/bin/rb-scoreboard <<WRAPPER
          #!/usr/bin/env bash
          export STATIC_DIR="$out/share/rb-scoreboard/static"
          exec ${backend}/bin/uvicorn app.main:app "\$@"
          WRAPPER
          chmod +x $out/bin/rb-scoreboard

          cat > $out/bin/rb-scoreboard-migrate <<WRAPPER
          #!/usr/bin/env bash
          cd $out/share/rb-scoreboard
          exec ${backend}/bin/alembic upgrade head
          WRAPPER
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
        inherit backend;

        frontend = mkFrontend "https://rb.qew.ch";
        frontend-local = mkFrontend "http://localhost:9400";

        default = mkApp self'.packages.frontend;
        local = mkApp self'.packages.frontend-local;
      };
    };
}
