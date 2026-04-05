export type TradeState = 
  | 'IDLE' 
  | 'WAITING_ASSET_INPUT' 
  | 'ORDER_SETUP_PANEL';

export interface TradeSessionData {
  side?: 'long' | 'short';
  asset?: string;
  assetId?: number;
  maxLeverage?: number;
  sizeUsdc?: number;
  leverage?: number;
  tp?: number | null;
  sl?: number | null;
  price?: number; 
  inputMode?: 'size' | 'lev' | 'tp' | 'sl' | null;
  promptMsgId?: number;
  panelMsgId?: number;
}

export interface TradeSession {
  state: TradeState;
  data: TradeSessionData;
}
