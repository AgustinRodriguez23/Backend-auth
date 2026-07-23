import { Strategy as GitHubStrategy } from 'passport-github2';
import User from '../models/User.js';

const githubStrategy = new GitHubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL, 
    scope: ['user:email'],
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ githubId: profile.id });
      if (user) return done(null, user);

      const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;

      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        user.githubId = profile.id;
        await user.save();
        return done(null, user);
      }

      const [firstName, ...rest] = (profile.displayName || profile.username).split(' ');
      const newUser = await User.create({
        firstName: firstName || profile.username,
        lastName: rest.join(' ') || 'GitHub',
        email: email.toLowerCase(),
        provider: 'github',
        githubId: profile.id,
      });
      
      return done(null, newUser);
    } catch (error) {
      return done(error);
    }
  }
);

export default githubStrategy;
