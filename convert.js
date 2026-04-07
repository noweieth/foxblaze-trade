const sharp = require('sharp');
const path = require('path');

async function convert() {
  const publicDir = path.join(process.cwd(), 'public');
  
  try {
    await sharp(path.join(publicDir, 'logo_foxblaze.svg'))
      .png()
      .toFile(path.join(publicDir, 'logo_foxblaze.png'));
    console.log('✅ Generated logo_foxblaze.png');

    await sharp(path.join(publicDir, 'background.svg'))
      .png()
      .toFile(path.join(publicDir, 'bg_card.png'));
    console.log('✅ Generated bg_card.png');

    await sharp(path.join(publicDir, 'logo_foxblaze.svg'))
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 7, g: 39, b: 34, alpha: 1 } // #072722
      })
      .png()
      .toFile(path.join(publicDir, 'avatar_foxblaze.png'));
    console.log('✅ Generated avatar_foxblaze.png');
  } catch (error) {
    console.error('❌ Error converting assets:', error);
  }
}

convert();
