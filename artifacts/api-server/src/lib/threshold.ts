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

export async function getPlatformConfig(): Promise<PlatformConfig> {
  const rows = await runRead<{
    platformFeeRate: unknown;
    memberDiscountRate: unknown;
    markupRate: unknown;
    walletFreezeThreshold: unknown;
  }>(
    `MATCH (cfg:Config {id: 'platform'})
     RETURN cfg.platformFeeRate AS platformFeeRate,
            cfg.memberDiscountRate AS memberDiscountRate,
            cfg.markupRate AS markupRate,
            cfg.walletFreezeThreshold AS walletFreezeThreshold`
  );
  if (rows.length === 0) {
    return {
      platformFeeRate: DEFAULT_PLATFORM_FEE_RATE,
      memberDiscountRate: DEFAULT_MEMBER_DISCOUNT,
      markupRate: 0,
      walletFreezeThreshold: DEFAULT_WALLET_FREEZE_THRESHOLD,
    };
  }
  const r = rows[0]!;
  return {
    platformFeeRate: toNumber(r.platformFeeRate) || DEFAULT_PLATFORM_FEE_RATE,
    memberDiscountRate: toNumber(r.memberDiscountRate) || DEFAULT_MEMBER_DISCOUNT,
    markupRate: toNumber(r.markupRate) || 0,
    walletFreezeThreshold: r.walletFreezeThreshold !== null && r.walletFreezeThreshold !== undefined
      ? toNumber(r.walletFreezeThreshold)
      : DEFAULT_WALLET_FREEZE_THRESHOLD,
  };
}

