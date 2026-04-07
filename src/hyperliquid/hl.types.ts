export interface AssetMeta {
  name: string;
  assetId: number;
  szDecimals: number;
  maxLeverage: number;
  tickSize: number;
}

export interface Position {
  asset: string;
  size: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: number;
  side: string;
}

export interface OpenOrder {
  asset: string;
  side: string;
  size: string;
  price: string;
  orderId: number;
  orderType: string;
}

export interface AccountState {
  equity: string;
  availableBalance: string;
  marginUsed: string;
  totalPnl: string;
  withdrawable: string;
}
