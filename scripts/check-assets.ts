import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

async function run() {
  const client = new InfoClient({ transport: new HttpTransport() });
  
  for (const c of ["xyz:WTIOIL", "xyz:WTI", "@WTIOIL", "@107", "xyz:CL"]) {
    try {
      const candles = await client.candleSnapshot({
        coin: c,
        interval: "15m",
        startTime: Date.now() - 24*60*60*1000,
        endTime: Date.now()
      });
      console.log(`Success for ${c}: length = ${candles ? candles.length : 0}`);
    } catch(e) {
      console.log(`Failed for ${c}`);
    }
  }
}
run();
