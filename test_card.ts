import { CardRenderer } from './src/telegram/card-renderer.service';
import * as fs from 'fs';

async function test() {
  const cardRenderer = new CardRenderer();
  await cardRenderer.onModuleInit();
  const buffShow = await cardRenderer.generateNewClosedPositionBuffer(null, {
        telegramId: BigInt(0),
        username: "DEAN FOX",
        asset: 'Gold',
        side: 'long',
        leverage: 10,
        entry: 41145,
        exit: 45123,
        size: 415,
        pnl: 100.40,
        roe: 0.242,
        hideProfit: false
  });
  fs.writeFileSync('/Users/vinhlam/.gemini/antigravity/brain/f57c9c82-8dd3-4a47-970b-0b4089cb3d12/test_pnl_show.png', buffShow);

  const buffHide = await cardRenderer.generateNewClosedPositionBuffer(null, {
        telegramId: BigInt(0),
        username: "DEAN FOX",
        asset: 'Gold',
        side: 'long',
        leverage: 10,
        entry: 41145,
        exit: 45123,
        size: 415,
        pnl: 100.40,
        roe: 0.242,
        hideProfit: true
  });
  fs.writeFileSync('/Users/vinhlam/.gemini/antigravity/brain/f57c9c82-8dd3-4a47-970b-0b4089cb3d12/test_pnl_hide.png', buffHide);
  console.log("Written test PNGs");
}
test();
