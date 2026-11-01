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
      nixosModule = import ./nix/nixos_module.nix self;
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

          profileEdit = pkgs.buildFHSEnv {
            name = "browser-chan-profile-edit";
            targetPkgs = ps: [
              ps.playwright-driver.browsers
              ps.fontconfig
              ps.noto-fonts-cjk-sans
            ];
            runScript = "${pkg}/bin/browser-chan-profile-edit";
          };
        in
        {
          formatter = pkgs.nixfmt-tree;
          devShells.default = (import ./nix/dev_shell.nix) { inherit pkgs chromium-rev; };
          packages = {
            default = pkg;
            profile-edit = profileEdit;
          };
          apps = {
            default = {
              type = "app";
              program = "${pkg}/bin/browser-chan";
            };
            profile-edit = {
              type = "app";
              program = "${profileEdit}/bin/browser-chan-profile-edit";
            };
            profile-export = {
              type = "app";
              program = "${pkg}/bin/browser-chan-profile-export";
            };
            profile-import = {
              type = "app";
              program = "${pkg}/bin/browser-chan-profile-import";
            };
          };
        }
      );
    in
    perSystem
    // {
      nixosModules.default = nixosModule;
    };

}
