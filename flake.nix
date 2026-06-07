{
  description = "rb-scoreboard";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    { self, flake-parts, ... }@inputs:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      imports = [
        ./nix/packages.nix
      ];

      flake = {
        overlays.default = final: prev: {
          rb-scoreboard = self.packages.${final.system}.default;
        };

        nixosModules.default = import ./nix/module.nix;
      };

      perSystem =
        { pkgs, ... }:
        {
          devShells.default = import ./shell.nix { inherit pkgs; };
        };
    };
}
