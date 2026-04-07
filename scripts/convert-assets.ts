import sharp from 'sharp';
import path from 'path';

async function convert() {
  const publicDir = path.join(process.cwd(), 'public');
  
  try {
    // 1. logo_foxblaze.svg -> logo_foxblaze.png
    await sharp(path.join(publicDir, 'logo_foxblaze.svg'))
      .png()
      .toFile(path.join(publicDir, 'logo_foxblaze.png'));
    console.log('✅ Generated logo_foxblaze.png');

    // 2. background.svg -> bg_card.png
    await sharp(path.join(publicDir, 'background.svg'))
      .png()
      .toFile(path.join(publicDir, 'bg_card.png'));
    console.log('✅ Generated bg_card.png');

    // 3. logo_foxblaze.svg -> avatar_foxblaze.png (512x512, padded)
    await sharp(path.join(publicDir, 'logo_foxblaze.svg'))
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 13, g: 17, b: 23, alpha: 1 } // bgDark padding
      })
      .png()
      .toFile(path.join(publicDir, 'avatar_foxblaze.png'));
    console.log('✅ Generated avatar_foxblaze.png');

  } catch (error) {
    console.error('❌ Error converting assets:', error);
  }
}

convert();
