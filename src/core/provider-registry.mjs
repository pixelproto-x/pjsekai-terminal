import { AppError } from "./errors.mjs";

export function createProviderRegistry() {
  const providers = new Map();

  function register(provider) {
    if (!provider || typeof provider.id !== "string" || !provider.id.trim()) {
      throw new TypeError("A provider must have a non-empty id.");
    }
    if (providers.has(provider.id)) {
      throw new AppError("PROVIDER_DUPLICATE", "Provider already registered: " + provider.id);
    }
    if (!Array.isArray(provider.regions) || provider.regions.length === 0) {
      throw new TypeError("A provider must declare at least one supported region.");
    }
    if (!provider.capabilities || typeof provider.capabilities !== "object") {
      throw new TypeError("A provider must declare its capabilities.");
    }
    const normalized = Object.freeze({
      ...provider,
      regions: Object.freeze([...provider.regions]),
      capabilities: Object.freeze({ ...provider.capabilities }),
    });
    providers.set(provider.id, normalized);
    return normalized;
  }

  function resolve({ region, capability }) {
    const matches = [...providers.values()].filter((provider) =>
      provider.regions.includes(region) && provider.capabilities[capability] === true
    );
    if (!matches.length) {
      throw new AppError(
        "SOURCE_UNAVAILABLE",
        "No configured source supports " + capability + " in region " + region + ".",
        { details: { region, capability } },
      );
    }
    return matches;
  }

  return Object.freeze({ register, resolve, list: () => [...providers.values()] });
}
