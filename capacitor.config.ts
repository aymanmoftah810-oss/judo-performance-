import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "im.judo.performance",
  appName: "Judo Performance",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https"
  }
};

export default config;
