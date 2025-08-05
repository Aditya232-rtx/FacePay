# 🚀 FacePay MVP - Quick Setup Guide

## ⚡ Get Started in 5 Minutes

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment
```bash
cp env.example .env
```

Edit `.env` with your settings:
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/facepay
JWT_SECRET=your-super-secret-jwt-key-change-this
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
```

### 3. Download Face Recognition Models
```bash
npm run download-models
```

### 4. Start the Backend
```bash
npm run dev
```

### 5. Open Frontend
Open `frontend/index.html` in your browser

## 🎯 What You Get

### ✅ Complete FacePay MVP with:
- **User Registration & Login** (email/password + face recognition)
- **Face Registration** - Capture and store face embeddings
- **Face-Based Authentication** - Login with just your face
- **Dashboard** - User profile and quick actions
- **Secure Backend API** - JWT authentication, rate limiting
- **MongoDB Integration** - User and payment data storage
- **Stripe Payment Processing** - Ready for payments
- **Modern UI/UX** - Responsive design with animations

### 🔗 API Endpoints Ready:
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/face-login` - Face-based login
- `POST /api/auth/register-face` - Register face
- `GET /api/users/profile` - Get user profile
- `POST /api/payments/face-payment` - Face-based payments

### 📱 Frontend Pages:
- **Landing Page** (`index.html`) - Welcome screen
- **Registration** (`register.html`) - Create account
- **Login** (`login.html`) - Password + face login
- **Face Registration** (`face-register.html`) - Capture face
- **Dashboard** (`dashboard.html`) - User dashboard

## 🚀 Quick Test

1. **Register a new user** at `frontend/register.html`
2. **Register your face** at `frontend/face-register.html`
3. **Login with face** at `frontend/login.html`
4. **View dashboard** at `frontend/dashboard.html`

## 🔧 Next Steps

1. **Set up MongoDB** (local or cloud)
2. **Get Stripe API keys** for payments
3. **Deploy to production** server
4. **Add payment pages** for transactions
5. **Enhance security** features

## 📞 Support

The backend is production-ready with:
- ✅ Security middleware (helmet, rate limiting)
- ✅ Error handling
- ✅ Input validation
- ✅ JWT authentication
- ✅ Face recognition service
- ✅ Payment processing
- ✅ Database models
- ✅ API documentation

Your FacePay MVP is ready to use! 🎉 