import { Injectable, Logger } from '@nestjs/common';
import { InfoClient, HttpTransport } from '@nktkas/hyperliquid';
import { RedisService } from '../common/redis.service';
import { AssetMeta, Position, OpenOrder, AccountState } from './hl.types';

@Injectable()
export class HlInfoService {
  private readonly logger = new Logger(HlInfoService.name);
  private infoClient: InfoClient;

  constructor(private readonly redisService: RedisService) {
    this.infoClient = new InfoClient({ transport: new HttpTransport() });
  }

  async cachedQuery<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = await this.redisService.client.get(key);
    if (cached) return JSON.parse(cached) as T;

    const data = await fetcher();
    await this.redisService.client.setex(key, ttl, JSON.stringify(data));
    return data;
  }

  async getAllAssets(): Promise<AssetMeta[]> {
    return this.cachedQuery<AssetMeta[]>('hl:assets', 300, async () => {
      const meta = await this.infoClient.meta();
      return meta.universe.map((a: any, i: number) => ({
        name: a.name,
        assetId: i,
        szDecimals: a.szDecimals,
        maxLeverage: a.maxLeverage,
        tickSize: parseFloat(a.tickSize)
      }));
    });
  }

  async findAsset(name: string): Promise<AssetMeta | undefined> {
    const assets = await this.getAllAssets();
    return assets.find(a => a.name.toUpperCase() === name.toUpperCase());
  }

  private readonly HIP3_ALIASES: Record<string, string> = {
    'WTIOIL': 'xyz:CL',
    'WTI': 'xyz:CL',
    'CL': 'xyz:CL',
    'CL-USDC': 'xyz:CL',
    'GOLD': 'xyz:GOLD',
    'XAU': 'xyz:GOLD',
    'SILVER': 'xyz:SILVER',
    'XAG': 'xyz:SILVER',
    'EUR': 'xyz:EUR',
    'EURUSD': 'xyz:EUR',
    'JPY': 'xyz:JPY',
    'USDJPY': 'xyz:JPY',
  };

  async findAssetFuzzy(query: string): Promise<{ asset: AssetMeta | null, suggestions: string[], displayName?: string }> {
    const q = query.trim().toUpperCase();

    if (this.HIP3_ALIASES[q]) {
      return { 
        asset: { name: this.HIP3_ALIASES[q], assetId: -1, szDecimals: 0, maxLeverage: 100, tickSize: 0.01 }, 
        suggestions: [],
        displayName: q
      };
    }
    
    if (q.startsWith('XYZ:')) {
      const properName = "xyz:" + q.slice(4);
      return { 
        asset: { name: properName, assetId: -1, szDecimals: 0, maxLeverage: 100, tickSize: 0.01 }, 
        suggestions: [],
        displayName: q.slice(4) // Drop the XYZ: for display
      };
    }

    const assets = await this.getAllAssets();
    
    const exact = assets.find(a => a.name.toUpperCase() === q);
    if (exact) return { asset: exact, suggestions: [] };
    
    // 1. Partial match where asset contains the query
    let matches = assets.filter(a => a.name.toUpperCase().includes(q));
    
    // 2. If no match and query is long enough, try matching assets that start with part of the query,
    // or where the query starts with the asset (e.g. WTIOIL starts with WTI)
    if (matches.length === 0 && q.length >= 3) {
      matches = assets.filter(a => 
        (a.name.length >= 3 && q.startsWith(a.name.toUpperCase())) || 
        a.name.toUpperCase().startsWith(q.slice(0, 3))
      );
    }
    
    const suggestions = Array.from(new Set(matches.map(a => a.name))).slice(0, 5);
    return { asset: null, suggestions };
  }

  async getMarketsData(): Promise<any[]> {
    return this.cachedQuery<any[]>('hl:markets', 10, async () => {
      const data = await this.infoClient.metaAndAssetCtxs();
      const metaAssets = data[0].universe;
      const ctxs = data[1];
      
      return metaAssets.map((asset: any, index: number) => ({
         name: asset.name,
         markPx: ctxs[index].markPx,
         prevDayPx: ctxs[index].prevDayPx,
         dayNtlVlm: ctxs[index].dayNtlVlm,
         percentChange: ((parseFloat(ctxs[index].markPx) - parseFloat(ctxs[index].prevDayPx)) / parseFloat(ctxs[index].prevDayPx)) * 100
      }));
    });
  }

  async getCandles(coin: string, interval: any, startTime: number, endTime: number): Promise<any[]> {
    const data = await this.infoClient.candleSnapshot({
      coin,
      interval,
      startTime,
      endTime
    });
    return data;
  }

  async getPositions(addr: string): Promise<Position[]> {
    return this.cachedQuery<Position[]>(`hl:pos:${addr}`, 5, async () => {
      const state = await this.infoClient.clearinghouseState({ user: addr as `0x${string}` });
      return state.assetPositions.map(p => ({
        asset: p.position.coin,
        size: p.position.szi,
        entryPrice: p.position.entryPx,
        markPrice: "0", 
        unrealizedPnl: p.position.unrealizedPnl,
        leverage: p.position.leverage.value,
        side: parseFloat(p.position.szi) >= 0 ? 'long' : 'short'
      }));
    });
  }

  async getOpenOrders(addr: string): Promise<any[]> {
    return this.cachedQuery<any[]>(`hl:orders:${addr}`, 5, async () => {
      // Use frontendOpenOrders to capture conditionals (TP/SL)
      const data = await this.infoClient.frontendOpenOrders({ user: addr as `0x${string}` });
      return data.map((o: any) => {
        let mappedType = 'limit';
        const rawType = (o.orderType || '').toLowerCase();
        
        if (rawType.includes('take profit')) {
          mappedType = 'Take Profit';
        } else if (rawType.includes('stop')) {
          mappedType = 'Stop Loss';
        }

        return {
          asset: o.coin,
          side: o.side === 'B' ? 'long' : 'short',
          size: o.sz,
          price: o.triggerPx || o.limitPx, // For TP/SL, limitPx is the execution, triggerPx is the trigger
          orderId: o.oid,
          orderType: mappedType,
          triggerCondition: o.triggerCondition,
          isTrigger: !!o.isTrigger
        };
      });
    });
  }

  async getAccountState(addr: string): Promise<AccountState> {
    return this.cachedQuery<AccountState>(`hl:account:${addr}`, 5, async () => {
      const state = await this.infoClient.clearinghouseState({ user: addr as `0x${string}` });
      const equity = parseFloat(state.marginSummary.accountValue);
      const marginUsed = parseFloat(state.marginSummary.totalMarginUsed);
      const totalPnl = state.assetPositions.reduce((sum, p) => sum + parseFloat(p.position.unrealizedPnl), 0);
      return {
        equity: equity.toString(),
        availableBalance: (equity - marginUsed).toString(),
        marginUsed: marginUsed.toString(),
        totalPnl: totalPnl.toString(),
        withdrawable: state.withdrawable
      };
    });
  }

  async getUserFills(addr: string): Promise<any> {
    return this.cachedQuery(`hl:fills:${addr}`, 30, async () => {
      return await this.infoClient.userFills({ user: addr as `0x${string}` });
    });
  }

  async invalidateUserCache(addr: string): Promise<void> {
    await this.redisService.client.del(`hl:pos:${addr}`);
    await this.redisService.client.del(`hl:orders:${addr}`);
    await this.redisService.client.del(`hl:account:${addr}`);
  }
}
