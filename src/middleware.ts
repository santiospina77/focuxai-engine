import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/home/:path*", "/ops/:path*", "/adapter/:path*", "/scan/:path*"],
};
