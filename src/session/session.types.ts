export type TradeState = 
  | 'IDLE' 
  | 'WAITING_ASSET_INPUT' 
  | 'ORDER_SETUP_PANEL'
  | 'WITHDRAW_WAITING_ADDRESS'
  | 'WITHDRAW_WAITING_AMOUNT';

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
  withdrawAddress?: string;
  withdrawAmount?: number;
}

export interface TradeSession {
  state: TradeState;
  data: TradeSessionData;
}
