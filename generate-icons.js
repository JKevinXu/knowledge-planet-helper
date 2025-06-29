const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const svgPath = path.join(__dirname, 'icons', 'icon.svg');
  const iconsDir = path.join(__dirname, 'icons');
  
  // Check if SVG file exists
  if (!fs.existsSync(svgPath)) {
    console.error('❌ SVG file not found:', svgPath);
    return;
  }
  
  console.log('📄 Generating PNG icons from SVG...');
  
  const sizes = [
    { size: 16, filename: 'icon16.png' },
    { size: 48, filename: 'icon48.png' },
    { size: 128, filename: 'icon128.png' }
  ];
  
  try {
    for (const { size, filename } of sizes) {
      const outputPath = path.join(iconsDir, filename);
      
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated ${filename} (${size}x${size})`);
    }
    
    console.log('🎉 All icon files generated successfully!');
    
    // List the generated files
    console.log('\n📁 Generated files:');
    for (const { filename } of sizes) {
      const filePath = path.join(iconsDir, filename);
      const stats = fs.statSync(filePath);
      console.log(`   ${filename} - ${Math.round(stats.size / 1024 * 10) / 10}KB`);
    }
    
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
  }
}

generateIcons(); 