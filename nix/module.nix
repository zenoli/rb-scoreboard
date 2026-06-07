{ config, lib, pkgs, ... }:

let
  cfg = config.services.rb-scoreboard;
in
{
  options.services.rb-scoreboard = {
    enable = lib.mkEnableOption "RB Scoreboard service";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.rb-scoreboard;
      defaultText = lib.literalExpression "pkgs.rb-scoreboard";
      description = "The rb-scoreboard package. Requires the rb-scoreboard overlay.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "rb-scoreboard";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "rb-scoreboard";
    };

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/rb-scoreboard";
      description = "Directory to store rb-scoreboard data (SQLite database).";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 9400;
      description = "Port the backend listens on.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.path;
      description = "Path to environment file containing secrets: SM_API_KEY, JWT_SECRET, ADMIN_API_KEY.";
    };

    extraEnv = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      description = "Additional environment variables passed to the service.";
    };
  };

  config = lib.mkIf cfg.enable {
    users.users.${cfg.user} = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.dataDir;
      createHome = true;
    };

    users.groups.${cfg.group} = { };

    systemd.services.rb-scoreboard = {
      description = "RB Scoreboard Service";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      environment = {
        DATABASE_URL = "sqlite+aiosqlite:////${cfg.dataDir}/scoreboard.db";
      } // cfg.extraEnv;

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        EnvironmentFile = cfg.environmentFile;
        ExecStartPre = "${cfg.package}/bin/rb-scoreboard-migrate";
        ExecStart = "${cfg.package}/bin/rb-scoreboard --host 0.0.0.0 --port ${toString cfg.port}";
        Restart = "on-failure";
        RestartSec = 5;
        WorkingDirectory = cfg.dataDir;

        NoNewPrivileges = true;
        PrivateTmp = true;
        CapabilityBoundingSet = "";
        SystemCallArchitectures = "native";
      };
    };
  };
}
