import express from 'express';
import cookieParser from 'cookie-parser';
import sessionConfig from './config/session.js';
import passport from './config/passport.js';
import authRoutes from './routes/authRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import protectedRoutes from './routes/protectedRoutes.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(sessionConfig); 
app.use(passport.initialize()); 

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/session', sessionRoutes);
app.use('/api/v1', protectedRoutes); 

app.use(errorHandler);

export default app
