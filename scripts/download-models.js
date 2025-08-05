const fs = require('fs');
const path = require('path');
const https = require('https');

const modelsDir = path.join(__dirname, '../models');
const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const models = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_expression_model-weights_manifest.json',
  'face_expression_model-shard1'
];

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded: ${path.basename(filepath)}`);
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete the file async
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function downloadModels() {
  try {
    // Create models directory if it doesn't exist
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
      console.log('📁 Created models directory');
    }

    console.log('🚀 Starting model downloads...');
    console.log('📥 This may take a few minutes depending on your internet connection...\n');

    for (const model of models) {
      const url = `${baseUrl}/${model}`;
      const filepath = path.join(modelsDir, model);
      
      try {
        await downloadFile(url, filepath);
      } catch (error) {
        console.error(`❌ Failed to download ${model}:`, error.message);
        throw error;
      }
    }

    console.log('\n🎉 All models downloaded successfully!');
    console.log('📁 Models are located in:', modelsDir);
    console.log('\nYou can now start the FacePay backend server.');
    
  } catch (error) {
    console.error('\n❌ Model download failed:', error.message);
    console.log('\n💡 Manual download instructions:');
    console.log('1. Create a "models" directory in the project root');
    console.log('2. Download the following files from:');
    console.log('   https://github.com/justadudewhohacks/face-api.js/tree/master/weights');
    console.log('3. Place them in the models directory');
    process.exit(1);
  }
}

// Run the download
downloadModels(); 