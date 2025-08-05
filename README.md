# FacePay Backend

A secure, face-recognition-based payment system backend built with Node.js, Express, MongoDB, and Stripe.

## 🚀 Features

- **Face Recognition Authentication**: Secure login using facial recognition
- **Face-Based Payments**: Process payments with face verification
- **Stripe Integration**: Complete payment processing with Stripe
- **User Management**: Full user registration and profile management
- **Security**: JWT authentication, rate limiting, and encryption
- **Image Processing**: Face detection, quality validation, and embedding generation
- **Payment History**: Track and manage payment transactions
- **API Documentation**: Comprehensive REST API endpoints

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Face Recognition**: face-api.js with TensorFlow.js
- **Payment Processing**: Stripe API
- **Image Processing**: Sharp, Canvas
- **Security**: bcryptjs, helmet, rate limiting
- **Validation**: express-validator, Joi

## 📋 Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or cloud)
- Stripe account with API keys
- Git

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd facepay-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the environment template and configure your variables:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/facepay

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key

# Face Recognition Configuration
FACE_RECOGNITION_THRESHOLD=0.6
FACE_DETECTION_CONFIDENCE=0.5
```

### 4. Download Face Recognition Models

Create a `models` directory and download the required face-api.js models:

```bash
mkdir models
cd models
```

Download the following files from [face-api.js models](https://github.com/justadudewhohacks/face-api.js/tree/master/weights):

- `tiny_face_detector_model-weights_manifest.json`
- `tiny_face_detector_model-shard1`
- `face_landmark_68_model-weights_manifest.json`
- `face_landmark_68_model-shard1`
- `face_recognition_model-weights_manifest.json`
- `face_recognition_model-shard1`
- `face_expression_model-weights_manifest.json`
- `face_expression_model-shard1`

### 5. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "password": "securepassword123"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

#### Face Login
```http
POST /api/auth/face-login
Content-Type: multipart/form-data

faceImage: [image file]
```

#### Register Face
```http
POST /api/auth/register-face
Authorization: Bearer <token>
Content-Type: multipart/form-data

faceImage: [image file]
```

### Face Recognition Endpoints

#### Detect Faces
```http
POST /api/face/detect
Content-Type: multipart/form-data

image: [image file]
```

#### Validate Face Quality
```http
POST /api/face/validate
Content-Type: multipart/form-data

image: [image file]
```

#### Verify Face
```http
POST /api/face/verify
Authorization: Bearer <token>
Content-Type: multipart/form-data

image: [image file]
```

### Payment Endpoints

#### Face Payment
```http
POST /api/payments/face-payment
Authorization: Bearer <token>
Content-Type: multipart/form-data

faceImage: [image file]
amount: 25.50
currency: usd
description: "Coffee purchase"
paymentMethod: card
```

#### Confirm Payment
```http
POST /api/payments/confirm
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentIntentId": "pi_xxx",
  "paymentMethodId": "pm_xxx"
}
```

#### Get Payment History
```http
GET /api/payments/history?limit=10&offset=0
Authorization: Bearer <token>
```

#### Get Payment Statistics
```http
GET /api/payments/stats?period=30d
Authorization: Bearer <token>
```

### User Management Endpoints

#### Get Profile
```http
GET /api/users/profile
Authorization: Bearer <token>
```

#### Update Profile
```http
PUT /api/users/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+1234567890"
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `MONGODB_URI` | MongoDB connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | JWT expiration time | 24h |
| `STRIPE_SECRET_KEY` | Stripe secret key | - |
| `FACE_RECOGNITION_THRESHOLD` | Face recognition threshold | 0.6 |
| `FACE_DETECTION_CONFIDENCE` | Face detection confidence | 0.5 |
| `BCRYPT_ROUNDS` | Password hashing rounds | 12 |
| `MAX_FILE_SIZE` | Maximum file upload size | 5MB |

### Face Recognition Settings

- **Threshold**: Lower values (0.4-0.6) are more strict, higher values (0.7-0.9) are more lenient
- **Confidence**: Minimum confidence for face detection (0.5-0.9)

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with configurable rounds
- **Rate Limiting**: Prevents brute force attacks
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable cross-origin requests
- **Helmet**: Security headers
- **Account Locking**: Temporary lock after failed attempts

## 📁 Project Structure

```
src/
├── config/
│   └── database.js          # Database configuration
├── middleware/
│   ├── auth.js             # Authentication middleware
│   └── errorHandler.js     # Error handling middleware
├── models/
│   ├── User.js             # User model
│   └── Payment.js          # Payment model
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── face.js             # Face recognition routes
│   ├── payments.js         # Payment routes
│   └── users.js            # User management routes
├── services/
│   ├── faceRecognition.js  # Face recognition service
│   └── paymentService.js   # Payment processing service
└── server.js               # Main server file
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 🚀 Deployment

### Production Setup

1. Set `NODE_ENV=production`
2. Configure production MongoDB URI
3. Set strong JWT secret
4. Configure Stripe production keys
5. Set up SSL/TLS certificates
6. Configure reverse proxy (nginx)
7. Set up monitoring and logging

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🔮 Roadmap

- [ ] Multi-factor authentication
- [ ] Advanced fraud detection
- [ ] Real-time payment notifications
- [ ] Mobile app integration
- [ ] Advanced analytics dashboard
- [ ] International payment support
- [ ] Biometric liveness detection 