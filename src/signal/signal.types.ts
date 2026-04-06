export class CreateSignalDto {
  asset!: string;
  side!: 'long' | 'short';
  entryPrice!: number;
  takeProfitPrice!: number;
  stopLossPrice!: number;
  leverage!: number;
  note?: string;
}
