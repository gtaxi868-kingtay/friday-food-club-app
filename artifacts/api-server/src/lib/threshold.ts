/**
 * Platform configuration helpers and default constants.
 *
 * Exports:
 *   - getPlatformConfig()  Reads the `Config {id:'platform'}` node from Neo4j and
 *                          returns a PlatformConfig object. Falls back to the DEFAULT_*
 *                          constants when no Config node exists.
 *   - DEFAULT_PLATFORM_FEE_RATE      10 % platform fee applied to chef earnings.
 *   - DEFAULT_MEMBER_DISCOUNT        10 % discount for Club Pass holders.
 *   - DEFAULT_WALLET_FREEZE_THRESHOLD  -50 TTD; wallet balance floor below which
 *                                      payouts are frozen.
 */
import { runRead, toNumber } from "./neo4j";

export const DEFAULT_PLATFORM_FEE_RATE = 0.10;   // 10 %
export const DEFAULT_MEMBER_DISCOUNT   = 0.10;   // 10 % for Club Pass holders

export const DEFAULT_WALLET_FREEZE_THRESHOLD = -50; // TTD — wallet can't dip below this

export interface PlatformConfig {
  platformFeeRate: number;
  memberDiscountRate: number;
  markupRate: number;
  walletFreezeThreshold: number;
}

const CONFIG_CACHE_TTL_MS = 30_000;
let cachedConfig: { value: PlatformConfig; expiresAt: number } | null = null;
let configRequest: Promise<PlatformConfig> | null = null;

export function clearPlatformConfigCache() {
  cachedConfig = null;
}

const defaults = (): PlatformConfig => ({
  platformFeeRate: DEFAULT_PLATFORM_FEE_RATE,
  memberDiscountRate: DEFAULT_MEMBER_DISCOUNT,
  markupRate: 0,
  walletFreezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD,
});

export async function getPlatformConfig(): Promise<PlatformConfig> {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) return cachedConfig.value;
  if (configRequest) return configRequest;

  configRequest = (async () => {
    try {
      const rows = await runRead<{
        platformFeeRate: unknown;
        memberDiscountRate: unknown;
        markupRate: unknown;
        walletFreezeThreshold: unknown;
      }>(
        `OPTIONAL MATCH (cfg:Config {id: 'platform'})
         RETURN cfg.platformFeeRate AS platformFeeRate,
                cfg.memberDiscountRate AS memberDiscountRate,
                cfg.markupRate AS markupRate,
                cfg.walletFreezeThreshold AS walletFreezeThreshold`
      );
      const r = rows[0] ?? {};
      const value: PlatformConfig = {
        // Zero is a valid configured value; don't turn it back into a default with ||.
        platformFeeRate: r.platformFeeRate == null ? DEFAULT_PLATFORM_FEE_RATE : toNumber(r.platformFeeRate),
        memberDiscountRate: r.memberDiscountRate == null ? DEFAULT_MEMBER_DISCOUNT : toNumber(r.memberDiscountRate),
        markupRate: r.markupRate == null ? 0 : toNumber(r.markupRate),
        walletFreezeThreshold: r.walletFreezeThreshold == null
          ? DEFAULT_WALLET_FREEZE_THRESHOLD
          : toNumber(r.walletFreezeThreshold),
      };
      cachedConfig = { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS };
      return value;
    } catch {
      // A cold or unavailable database must not block safe default behavior.
      return defaults();
    } finally {
      configRequest = null;
    }
  })();

  return configRequest;
}

