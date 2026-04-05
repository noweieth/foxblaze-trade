export interface OpenPositionJob {
  userId: number;
  asset: number; // AssetId of Hyperliquid
  isBuy: boolean;
  size: string; // Size base token or usdc string ? Usually size of coin on HL
  leverage: number;
  tp?: string;
  sl?: string;
}

export interface ClosePositionJob {
  userId: number;
  asset: number;
  size: string;
  currentSide: string; // 'long' or 'short'
}

export interface SetTpSlJob {
  userId: number;
  asset: number;
  size: string;
  isBuy: boolean;
  tp?: string;
  sl?: string;
}

export interface CancelOrderJob {
  userId: number;
  asset: number;
  orderId: number;
}
