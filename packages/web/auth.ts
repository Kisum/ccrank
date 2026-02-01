import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { DefaultSession } from "next-auth";

// Extend NextAuth types to include GitHub username
declare module "next-auth" {
  interface Session {
    user: {
      username?: string;
    } & DefaultSession["user"];
  }
}

// GitHub profile type
type GitHubProfile = {
  login: string;
  id: number;
  avatar_url: string;
  name?: string;
  email?: string;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, profile }) {
      if (profile && 'login' in profile) {
        token.username = (profile as unknown as GitHubProfile).login;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.username) {
        session.user.username = token.username as string;
      }
      return session;
    },
  },
});
