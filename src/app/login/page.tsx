// @ts-nocheck
"use client";
import dynamic from "next/dynamic";

const LoginContent = dynamic(() => import("./LoginContent"), { ssr: false });

export default function LoginPage() {
  return <LoginContent />;
}
