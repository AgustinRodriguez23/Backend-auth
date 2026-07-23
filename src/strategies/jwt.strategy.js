import { Strategy as JwtStrategy } from 'passport-jwt';
import User from '../models/User.js';

const cookieOrHeaderExtractor = (req) => {
  if (req?.cookies?.authToken) return req.cookies.authToken;

  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
};

const options = {
  jwtFromRequest: cookieOrHeaderExtractor,
  secretOrKey: process.env.JWT_SECRET,
};


const jwtStrategy = new JwtStrategy(options, async (payload, done) => {
  try {
    const user = await User.findById(payload.userId);
    if (!user) return done(null, false); 
    return done(null, user);
  } catch (error) {
    return done(error, false);
  }
});

export default jwtStrategy;
