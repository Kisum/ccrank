import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        token.username = profile.login;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.username) {
        (session.user as any).username = token.username;
      }
      return session;
    },
  },
});
