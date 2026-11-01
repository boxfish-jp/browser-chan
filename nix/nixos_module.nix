self:
{
  lib,
  config,
  pkgs,
  ...
}:

let
  cfg = config.services.browser-chan;
  pkg = cfg.package;
  loopbackHosts = [
    "127.0.0.1"
    "::1"
    "localhost"
  ];
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

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port for the HTTP server to listen on";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "0.0.0.0";
      description = "Host address to bind to (0.0.0.0 for all interfaces)";
    };

    profileDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/browser-chan/profile";
      description = "Directory to store the browser profile data";
    };

    mcpTokenFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "Absolute path to a file containing the MCP bearer token";
    };

    mcpAllowedHosts = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Additional Host and Origin hostnames allowed for /mcp";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Open the configured port in the firewall";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = lib.elem cfg.host loopbackHosts || cfg.mcpTokenFile != null;
        message = "services.browser-chan: set mcpTokenFile when host is not loopback";
      }
      {
        assertion =
          cfg.mcpTokenFile == null || lib.hasPrefix "/" cfg.mcpTokenFile;
        message = "services.browser-chan: mcpTokenFile must be an absolute path";
      }
    ];

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];

    environment.systemPackages = [ pkg ];

    systemd.services.browser-chan = {
      description = "browser-chan headless browser service";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      serviceConfig = {
        ExecStart = "${pkg}/bin/browser-chan";
        Restart = "on-failure";
        DynamicUser = true;
        StateDirectory = "browser-chan";
        StateDirectoryMode = "0700";
        TimeoutStopSec = 30;
        LoadCredential = lib.optional (
          cfg.mcpTokenFile != null
        ) "mcp-token:${cfg.mcpTokenFile}";
        Environment =
          [
            "BROWSER_CHAN_HOST=${cfg.host}"
            "BROWSER_CHAN_PORT=${toString cfg.port}"
            "BROWSER_CHAN_PROFILE_DIR=${cfg.profileDir}"
          ]
          ++ lib.optional (
            cfg.mcpTokenFile != null
          ) "BROWSER_CHAN_MCP_TOKEN_FILE=%d/mcp-token"
          ++ lib.optional (
            cfg.mcpAllowedHosts != [ ]
          ) "BROWSER_CHAN_MCP_ALLOWED_HOSTS=${lib.concatStringsSep "," cfg.mcpAllowedHosts}";
      };
    };
  };
}
