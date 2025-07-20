const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function resizeScreenshots() {
  const screenshotsDir = path.join(__dirname, 'screenshots');
  const outputDir = path.join(__dirname, 'screenshots-resized');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  // Get all PNG files in screenshots directory
  const files = fs.readdirSync(screenshotsDir).filter(file => 
    file.toLowerCase().endsWith('.png') || file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')
  );

  console.log(`Found ${files.length} image(s) to resize:`);
  files.forEach(file => console.log(`- ${file}`));

  for (const file of files) {
    const inputPath = path.join(screenshotsDir, file);
    const outputPath = path.join(outputDir, file);
    
    try {
      console.log(`\nResizing ${file}...`);
      
      // Get original dimensions
      const metadata = await sharp(inputPath).metadata();
      console.log(`Original: ${metadata.width}x${metadata.height}`);
      
      // Resize to 1280x800 keeping the LEFT side
      await sharp(inputPath)
        .resize(1280, 800, {
          fit: 'cover', // Crop to fit exact dimensions
          position: 'left' // Keep the left side instead of center
        })
        .png({ quality: 90 })
        .toFile(outputPath);
      
      // Get new file size
      const stats = fs.statSync(outputPath);
      const fileSizeKB = Math.round(stats.size / 1024);
      
      console.log(`✅ Resized to 1280x800 (left-aligned) → ${outputPath} (${fileSizeKB} KB)`);
      
    } catch (error) {
      console.error(`❌ Error resizing ${file}:`, error.message);
    }
  }
  
  console.log(`\n🎉 Resize complete! Check the 'screenshots-resized' folder.`);
}

resizeScreenshots().catch(console.error); 