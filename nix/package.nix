{
  pkgs,
  pname,
  version,
  src,
  node,
  pnpm,
  chromium-rev,
}:

pkgs.stdenv.mkDerivation (finalAttrs: {
  inherit src version pname;

  nativeBuildInputs = [
    pnpm
    node
    pkgs.pnpmConfigHook
  ];

  pnpmDeps = pkgs.fetchPnpmDeps {
    inherit
      version
      src
      pnpm
      pname
      ;
    fetcherVersion = 4;
    hash = "sha256-DMZG62rkQVdkyo6CnGUxqGOAO2D3qLW1gEoOUJ/nEb8=";
  };

  buildPhase = ''
    runHook preBuild
    pnpm install --frozen-lockfile
    pnpm run build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/$pname
    cp -a . $out/lib/$pname
    mkdir -p $out/bin

    NODE_BIN="${node}/bin/node"

    cat > $out/bin/$pname <<EOF
    #!${pkgs.bash}/bin/bash
    set -euo pipefail
    export PATH="${pkgs.gnutar}/bin:${pkgs.gzip}/bin:${pkgs.coreutils}/bin:\$PATH"
    export PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH="${pkgs.playwright-driver.browsers}/chromium-${chromium-rev}/chrome-linux64/chrome";
    export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
    export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="ubuntu-24.04"
    export NODE_PATH="${placeholder "out"}/lib/${pname}/node_modules"
    exec "$NODE_BIN" "${placeholder "out"}/lib/${pname}/dist/src/index.js" "\$@"
    EOF
    chmod +x $out/bin/$pname

    cat > $out/bin/browser-chan-edit <<EOF
    #!${pkgs.bash}/bin/bash
    set -euo pipefail
    exec "${placeholder "out"}/bin/$pname" edit "\$@"
    EOF
    chmod +x $out/bin/browser-chan-edit

    for subcommand in export import; do
      cat > $out/bin/browser-chan-$subcommand <<EOF
    #!${pkgs.bash}/bin/bash
    set -euo pipefail
    export PATH="${pkgs.gnutar}/bin:${pkgs.gzip}/bin:${pkgs.coreutils}/bin:\$PATH"
    export NODE_PATH="${placeholder "out"}/lib/${pname}/node_modules"
    exec "$NODE_BIN" "${placeholder "out"}/lib/${pname}/dist/cli/index.js" $subcommand "\$@"
    EOF
      chmod +x $out/bin/browser-chan-$subcommand
    done

    runHook postInstall
  '';

  meta = {
    description = "ヘッドレスブラウザちゃん";
    license = pkgs.lib.licenses.mit;
    mainProgram = "browser-chan";
  };
})
