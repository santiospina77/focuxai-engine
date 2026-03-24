import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

// Protect these routes — login and API routes are excluded
export const config = {
  matcher: ["/ops/:path*", "/adapter/:path*", "/scan/:path*"],
};
