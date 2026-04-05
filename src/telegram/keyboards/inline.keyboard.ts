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

export function buildOrderPanelKeyboard(data: any): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // Row 1: Size Presets
  keyboard.text('💰 $10', 'set_size_10')
          .text('💰 $50', 'set_size_50')
          .text('💰 $100', 'set_size_100')
          .text('✏️ Custom Size', 'set_size_custom').row();

  // Row 2: Leverage Presets
  keyboard.text('🚀 5x', 'set_lev_5')
          .text('🚀 10x', 'set_lev_10');
  if (data.maxLeverage && data.maxLeverage >= 20) {
    keyboard.text('🚀 20x', 'set_lev_20');
  }
  keyboard.text('✏️ Custom Lev', 'set_lev_custom').row();

  // Row 3: TP / SL Buttons
  const tpText = data.tp ? `🎯 TP: ${data.tp}` : '🎯 Set TP';
  const slText = data.sl ? `🛡️ SL: ${data.sl}` : '🛡️ Set SL';
  keyboard.text(tpText, 'set_tp_custom')
          .text(slText, 'set_sl_custom').row();

  // Row 4: Confirm / Cancel
  keyboard.text('❌ Cancel', 'cancel_trade')
          .text('✅ CONFIRM TRADE', 'confirm_trade');

  return keyboard;
}
