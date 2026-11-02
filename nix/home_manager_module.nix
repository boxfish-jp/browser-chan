self:
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.browser-chan;
  pkg = cfg.package;
in

{
  options.services.browser-chan = {
    enable = lib.mkEnableOption "browser-chan headless browser service";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.system}.default;
      defaultText = lib.literalExpression "self.packages.\${pkgs.system}.default";
      description = "browser-chan package to use";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Host name or IP address to bind to (for example 127.0.0.1, localhost or 0.0.0.0)";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port for the HTTP server to listen on";
    };

    profileDir = lib.mkOption {
      type = lib.types.str;
      default = "${config.home.homeDirectory}/.local/share/browser-chan";
      defaultText = lib.literalExpression ''"''${config.home.homeDirectory}/.local/share/browser-chan"'';
      description = ''
        Directory to store the browser profile data. Must be an absolute path, writable by the service user, and must not be in the Nix store.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ pkg ];

    systemd.user.services.browser-chan = {
      Unit = {
        Description = "browser-chan headless browser service";
      };
      Service = {
        ExecStart = "${pkg}/bin/browser-chan";
        Restart = "on-failure";
        TimeoutStopSec = 30;
        Environment = [
          "BROWSER_CHAN_HOST=${cfg.host}"
          "BROWSER_CHAN_PORT=${toString cfg.port}"
          "BROWSER_CHAN_PROFILE_DIR=\"${cfg.profileDir}\""
        ];
      };
      Install.WantedBy = [ "default.target" ];
    };
  };
}
