import { isIP } from "node:net";
import { hostname, networkInterfaces } from "node:os";
import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";

const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

const normalizeHost = (value: string): string[] => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }
  let host = trimmed;
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end > 0) {
      host = host.slice(1, end);
    }
  } else if (host.split(":").length === 2) {
    host = host.slice(0, host.lastIndexOf(":"));
  }
  host = host.replace(/\.+$/, "");
  if (!host) {
    return [];
  }
  return host.includes(":") ? [`[${host}]`] : [host];
};

const hostnameFromHostHeader = (header: string | null): string | null => {
  if (!header) {
    return null;
  }
  try {
    return new URL(`http://${header}`).hostname
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .toLowerCase();
  } catch {
    return null;
  }
};

const isIpLiteralHost = (header: string | null): boolean => {
  const host = hostnameFromHostHeader(header);
  return host !== null && isIP(host) !== 0;
};

const localHosts = (): string[] => {
  const hosts = [hostname()];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.internal) {
        continue;
      }
      hosts.push(
        address.family === "IPv6" ? `[${address.address}]` : address.address,
      );
    }
  }
  return hosts.flatMap(normalizeHost);
};

export const createMcpRequestGuard = (
  configuredHost: string,
  extraHosts: string[],
): ((request: Request) => Response | undefined) => {
  const allowedHosts = new Set<string>(localhostAllowedHostnames());
  for (const host of localHosts()) {
    allowedHosts.add(host);
  }
  if (!WILDCARD_HOSTS.has(configuredHost.trim().toLowerCase())) {
    for (const host of normalizeHost(configuredHost)) {
      allowedHosts.add(host);
    }
  }
  for (const host of extraHosts) {
    for (const normalized of normalizeHost(host)) {
      allowedHosts.add(normalized);
    }
  }
  const hostnames = [...allowedHosts];
  const origins = [...new Set([...localhostAllowedOrigins(), ...hostnames])];
  return (request) => {
    const hostHeader = request.headers.get("host");
    const hostRejected = isIpLiteralHost(hostHeader)
      ? undefined
      : hostHeaderValidationResponse(request, hostnames);
    return hostRejected ?? originValidationResponse(request, origins);
  };
};
