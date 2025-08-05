const faceapi = require('face-api.js');
const canvas = require('canvas');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Configure face-api.js to use canvas
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

class FaceRecognitionService {
  constructor() {
    this.isInitialized = false;
    this.modelsPath = path.join(__dirname, '../../models');
    this.threshold = parseFloat(process.env.FACE_RECOGNITION_THRESHOLD) || 0.6;
    this.confidence = parseFloat(process.env.FACE_DETECTION_CONFIDENCE) || 0.5;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🔍 Initializing face recognition models...');
      
      // Load face detection and recognition models
      await faceapi.nets.tinyFaceDetector.loadFromDisk(this.modelsPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsPath);
      await faceapi.nets.faceExpressionNet.loadFromDisk(this.modelsPath);
      
      this.isInitialized = true;
      console.log('✅ Face recognition models loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load face recognition models:', error);
      throw new Error('Face recognition initialization failed');
    }
  }

  async preprocessImage(imageBuffer) {
    try {
      // Resize and optimize image for face detection
      const processedBuffer = await sharp(imageBuffer)
        .resize(640, 480, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      throw new Error('Image preprocessing failed: ' + error.message);
    }
  }

  async detectFaces(imageBuffer) {
    await this.initialize();

    try {
      const processedBuffer = await this.preprocessImage(imageBuffer);
      const img = await canvas.loadImage(processedBuffer);
      
      // Detect faces with landmarks
      const detections = await faceapi
        .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 224,
          scoreThreshold: this.confidence 
        }))
        .withFaceLandmarks()
        .withFaceExpressions();

      if (detections.length === 0) {
        throw new Error('No faces detected in the image');
      }

      if (detections.length > 1) {
        throw new Error('Multiple faces detected. Please use an image with only one face');
      }

      return detections[0];
    } catch (error) {
      throw new Error('Face detection failed: ' + error.message);
    }
  }

  async generateEmbedding(imageBuffer) {
    try {
      const detection = await this.detectFaces(imageBuffer);
      
      // Generate face descriptor (embedding)
      const descriptor = await faceapi.computeFaceDescriptor(detection);
      
      return {
        embedding: Array.from(descriptor),
        confidence: detection.detection.score,
        landmarks: detection.landmarks,
        expressions: detection.expressions
      };
    } catch (error) {
      throw new Error('Embedding generation failed: ' + error.message);
    }
  }

  async compareFaces(embedding1, embedding2) {
    try {
      if (!embedding1 || !embedding2) {
        throw new Error('Both embeddings are required for comparison');
      }

      if (embedding1.length !== embedding2.length) {
        throw new Error('Embeddings must have the same length');
      }

      // Calculate Euclidean distance
      let sum = 0;
      for (let i = 0; i < embedding1.length; i++) {
        sum += Math.pow(embedding1[i] - embedding2[i], 2);
      }
      const distance = Math.sqrt(sum);

      // Convert distance to similarity score (0-1)
      const similarity = Math.max(0, 1 - distance);

      return {
        distance,
        similarity,
        isMatch: similarity >= this.threshold
      };
    } catch (error) {
      throw new Error('Face comparison failed: ' + error.message);
    }
  }

  async findBestMatch(targetEmbedding, storedEmbeddings) {
    try {
      let bestMatch = null;
      let bestSimilarity = 0;

      for (const stored of storedEmbeddings) {
        const comparison = await this.compareFaces(targetEmbedding, stored.embedding);
        
        if (comparison.similarity > bestSimilarity) {
          bestSimilarity = comparison.similarity;
          bestMatch = {
            ...stored,
            similarity: comparison.similarity,
            distance: comparison.distance
          };
        }
      }

      return bestMatch && bestMatch.similarity >= this.threshold ? bestMatch : null;
    } catch (error) {
      throw new Error('Best match search failed: ' + error.message);
    }
  }

  async validateFaceQuality(imageBuffer) {
    try {
      const detection = await this.detectFaces(imageBuffer);
      
      const qualityChecks = {
        isDetected: true,
        confidence: detection.detection.score,
        isHighQuality: detection.detection.score >= 0.8,
        hasLandmarks: !!detection.landmarks,
        faceSize: detection.detection.box.area,
        isCentered: this.isFaceCentered(detection.detection.box, 640, 480),
        brightness: await this.checkBrightness(imageBuffer),
        blur: await this.checkBlur(imageBuffer)
      };

      return {
        ...qualityChecks,
        isAcceptable: qualityChecks.isHighQuality && 
                     qualityChecks.isCentered && 
                     qualityChecks.brightness.isGood && 
                     qualityChecks.blur.isGood
      };
    } catch (error) {
      return {
        isDetected: false,
        error: error.message,
        isAcceptable: false
      };
    }
  }

  isFaceCentered(box, imageWidth, imageHeight) {
    const centerX = imageWidth / 2;
    const centerY = imageHeight / 2;
    const faceCenterX = box.x + box.width / 2;
    const faceCenterY = box.y + box.height / 2;
    
    const tolerance = 0.3; // 30% tolerance
    const maxOffsetX = imageWidth * tolerance;
    const maxOffsetY = imageHeight * tolerance;
    
    return Math.abs(faceCenterX - centerX) <= maxOffsetX && 
           Math.abs(faceCenterY - centerY) <= maxOffsetY;
  }

  async checkBrightness(imageBuffer) {
    try {
      const { data } = await sharp(imageBuffer)
        .resize(100, 100)
        .raw()
        .toBuffer({ resolveWithObject: true });

      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 3) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      
      const averageBrightness = totalBrightness / (data.length / 3);
      const isGood = averageBrightness > 50 && averageBrightness < 200;
      
      return {
        value: averageBrightness,
        isGood,
        message: isGood ? 'Good brightness' : 'Poor brightness'
      };
    } catch (error) {
      return { value: 0, isGood: false, message: 'Unable to check brightness' };
    }
  }

  async checkBlur(imageBuffer) {
    try {
      const { data } = await sharp(imageBuffer)
        .resize(100, 100)
        .raw()
        .toBuffer({ resolveWithObject: true });

      let blurScore = 0;
      const width = 100;
      const height = 100;
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 3;
          const current = data[idx];
          const right = data[idx + 3];
          const down = data[idx + width * 3];
          
          blurScore += Math.abs(current - right) + Math.abs(current - down);
        }
      }
      
      const averageBlur = blurScore / ((width - 1) * (height - 1));
      const isGood = averageBlur > 10; // Threshold for acceptable sharpness
      
      return {
        value: averageBlur,
        isGood,
        message: isGood ? 'Image is sharp' : 'Image is too blurry'
      };
    } catch (error) {
      return { value: 0, isGood: false, message: 'Unable to check blur' };
    }
  }

  async saveImage(imageBuffer, filename) {
    try {
      const uploadPath = process.env.UPLOAD_PATH || './uploads';
      const filePath = path.join(uploadPath, filename);
      
      // Ensure upload directory exists
      await fs.mkdir(uploadPath, { recursive: true });
      
      // Save optimized image
      await sharp(imageBuffer)
        .resize(400, 400, { fit: 'cover' })
        .jpeg({ quality: 85 })
        .toFile(filePath);
      
      return filename;
    } catch (error) {
      throw new Error('Failed to save image: ' + error.message);
    }
  }
}

module.exports = new FaceRecognitionService(); 