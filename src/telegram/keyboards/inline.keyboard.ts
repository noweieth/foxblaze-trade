import { InlineKeyboard } from 'grammy';

export function buildLeverageKeyboard(maxLeverage: number): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text('3x', 'lev_3').text('5x', 'lev_5').text('10x', 'lev_10');
  
  if (maxLeverage >= 20) {
    keyboard.text('20x', 'lev_20');
  }
  
  keyboard.row().text('Custom', 'lev_custom');
  return keyboard;
}

export function buildConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', 'confirm_trade')
    .text('❌ Cancel', 'cancel_trade');
}

export function buildPositionKeyboard(asset: string, side: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎯 TP', `pos_tp_${asset}_${side}`)
    .text('🛡️ SL', `pos_sl_${asset}_${side}`)
    .text('❌ Close', `pos_close_${asset}_${side}`);
}
