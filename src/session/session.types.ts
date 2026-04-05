export type TradeState = 
  | 'IDLE' 
  | 'AWAITING_ASSET' 
  | 'AWAITING_SIZE' 
  | 'AWAITING_LEVERAGE' 
  | 'AWAITING_TP' 
  | 'AWAITING_SL' 
  | 'AWAITING_CONFIRM';

export interface TradeSessionData {
  side?: 'long' | 'short';
  asset?: string;
  assetId?: number;
  maxLeverage?: number;
  sizeUsdc?: number;
  leverage?: number;
  tp?: number;
  sl?: number;
  price?: number; // Only for limit orders if we support them later
}

export interface TradeSession {
  state: TradeState;
  data: TradeSessionData;
}
