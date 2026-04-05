import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { createSubAccount, approveAgent, setReferrer, approveBuilderFee } from '@nktkas/hyperliquid/api/exchange';
import { ethers } from 'ethers';

@Injectable()
export class HlExchangeService {
  private readonly logger = new Logger(HlExchangeService.name);
  private transport = new HttpTransport();

  constructor(private readonly config: ConfigService) {}

  private getMasterWallet() {
    const key = this.config.get<string>('HYPERLIQUID_MASTER_KEY');
    if (!key) throw new Error("HYPERLIQUID_MASTER_KEY missing");
    return new ethers.Wallet(key);
  }

  async acceptTerms(userPrivateKey: string) {
    this.logger.log('acceptTerms logic should be signed explicitly if strictly mandated. Skipped standard L1 action.');
  }

  async approveAgent(userPrivateKey: string, agentAddress: string) {
    const userWallet = new ethers.Wallet(userPrivateKey);
    
    await approveAgent(
      { wallet: userWallet, transport: this.transport },
      {
        agentAddress: agentAddress as `0x${string}`,
        agentName: "FoxBlaze"
      }
    );
  }

  async setReferrer(userPrivateKey: string, code: string) {
    const userWallet = new ethers.Wallet(userPrivateKey);
    
    await setReferrer(
      { wallet: userWallet, transport: this.transport },
      { code }
    );
  }

  async approveBuilderFee(userPrivateKey: string, builderAddress: string, maxFeeRate: string) {
    const userWallet = new ethers.Wallet(userPrivateKey);
    
    await approveBuilderFee(
      { wallet: userWallet, transport: this.transport },
      {
        builder: builderAddress as `0x${string}`,
        maxFeeRate
      }
    );
  }

  async placeMarketOrder(params: { agentKey: string, vaultAddress: string, asset: number, isBuy: boolean, size: string, leverage: number, markPx: number }) {
    const agentWallet = new ethers.Wallet(params.agentKey);
    const client = new ExchangeClient({ 
      wallet: agentWallet, 
      transport: this.transport
    });
    
    const builderAddress = this.config.get<string>('HYPERLIQUID_MASTER_ADDRESS');
    const builderFeeRate = parseInt(this.config.get<string>('BUILDER_FEE_TENTHS_BPS') || '15', 10);
    
    // Slippage 3% từ mark price, rounded 5 sig figs
    const p = this.slippagePrice(params.markPx, params.isBuy);
    
    return await client.order({
      orders: [{
        a: params.asset,
        b: params.isBuy,
        p,
        s: params.size,
        r: false,
        t: { limit: { tif: "Ioc" } }
      }],
      grouping: "na",
      builder: builderAddress ? { b: builderAddress as `0x${string}`, f: builderFeeRate } : undefined
    });
  }

  async setLeverage({ agentKey, vaultAddress, asset, leverage, isCross }: any) {
    const agentWallet = new ethers.Wallet(agentKey);
    const client = new ExchangeClient({ wallet: agentWallet, transport: this.transport });
    await client.updateLeverage({ asset, leverage, isCross });
  }

  async placeTakeProfit({ agentKey, vaultAddress, asset, size, triggerPrice, isBuy }: any) {
    const agentWallet = new ethers.Wallet(agentKey);
    const client = new ExchangeClient({ wallet: agentWallet, transport: this.transport });

    const tpSide = !isBuy;
    const slippagePrice = this.slippagePrice(parseFloat(triggerPrice), tpSide);

    await client.order({
      orders: [{
        a: asset,
        b: tpSide,
        p: slippagePrice,
        s: Math.abs(parseFloat(size)).toString(),
        r: true,
        t: { trigger: { triggerPx: triggerPrice, isMarket: true, tpsl: "tp" } }
      }],
      grouping: "na"
    });
  }

  async placeStopLoss({ agentKey, vaultAddress, asset, size, triggerPrice, isBuy }: any) {
    const agentWallet = new ethers.Wallet(agentKey);
    const client = new ExchangeClient({ wallet: agentWallet, transport: this.transport });

    const slSide = !isBuy;
    const slippagePrice = this.slippagePrice(parseFloat(triggerPrice), slSide);

    await client.order({
      orders: [{
        a: asset,
        b: slSide,
        p: slippagePrice,
        s: Math.abs(parseFloat(size)).toString(),
        r: true,
        t: { trigger: { triggerPx: triggerPrice, isMarket: true, tpsl: "sl" } }
      }],
      grouping: "na"
    });
  }

  async cancelOrder({ agentKey, vaultAddress, asset, orderId }: any) {
    const agentWallet = new ethers.Wallet(agentKey);
    const client = new ExchangeClient({ wallet: agentWallet, transport: this.transport });
    await client.cancel({ cancels: [{ a: asset, o: orderId }] });
  }

  async closePosition({ agentKey, vaultAddress, asset, size, currentSide, markPx }: any) {
    const agentWallet = new ethers.Wallet(agentKey);
    const client = new ExchangeClient({ wallet: agentWallet, transport: this.transport });

    const isBuy = currentSide === 'short';
    const p = this.slippagePrice(markPx, isBuy);

    await client.order({
      orders: [{
        a: asset,
        b: isBuy,
        p,
        s: Math.abs(parseFloat(size)).toString(),
        r: true,
        t: { limit: { tif: "Ioc" } }
      }],
      grouping: "na"
    });
  }

  /**
   * Tính giá slippage động: ±3% từ giá thực, round 5 significant figures.
   * Buy → giá cao hơn (chấp nhận fill cao), Sell → giá thấp hơn.
   */
  private slippagePrice(markPx: number, isBuy: boolean): string {
    const slippage = isBuy ? 1.03 : 0.97;
    const raw = markPx * slippage;
    return this.roundTo5SigFigs(raw);
  }

  private roundTo5SigFigs(n: number): string {
    if (n === 0) return "0";
    const d = Math.ceil(Math.log10(Math.abs(n)));
    const power = 5 - d;
    const magnitude = Math.pow(10, power);
    const shifted = Math.round(n * magnitude);
    return (shifted / magnitude).toString();
  }
}

