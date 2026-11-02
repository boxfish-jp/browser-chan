{
  description = "ヘッドレスブラウザちゃん";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      ...
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      perSystem = flake-utils.lib.eachSystem systems (
        system:
        let
          pname = "browser-chan";
          pkgs = import nixpkgs { inherit system; };
          pnpm = pkgs.pnpm_11;
          node = pkgs.nodejs_24;
          src = ./.;
          version = "2.0.0";
          browsers =
            (builtins.fromJSON (builtins.readFile "${pkgs.playwright-driver}/browsers.json")).browsers;
          chromium-rev = (builtins.head (builtins.filter (x: x.name == "chromium") browsers)).revision;

          pkg = (import ./nix/package.nix) {
            inherit
              pkgs
              pname
              version
              src
              node
              pnpm
              chromium-rev
              ;
          };

          edit = pkgs.buildFHSEnv {
            name = "browser-chan-edit";
            targetPkgs = ps: [
              ps.playwright-driver.browsers
              ps.fontconfig
              ps.noto-fonts-cjk-sans
            ];
            runScript = "${pkg}/bin/browser-chan-edit";
          };
        in
        {
          formatter = pkgs.nixfmt-tree;
          devShells.default = (import ./nix/dev_shell.nix) { inherit pkgs chromium-rev; };
          packages = {
            default = pkg;
            inherit edit;
          };
          apps = {
            default = {
              type = "app";
              program = "${pkg}/bin/browser-chan";
            };
            edit = {
              type = "app";
              program = "${edit}/bin/browser-chan-edit";
            };
            export = {
              type = "app";
              program = "${pkg}/bin/browser-chan-export";
            };
            import = {
              type = "app";
              program = "${pkg}/bin/browser-chan-import";
            };
          };
        }
      );
    in
    perSystem
    // {
      homeManagerModules.default = import ./nix/home_manager_module.nix self;
    };

}
