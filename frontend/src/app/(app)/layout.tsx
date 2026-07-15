"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/nav/BottomNav";

const USER_ID_KEY = "liber:userId";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(USER_ID_KEY)) {
      setReady(true);
    } else {
      router.replace("/");
    }
  }, [router]);

  if (!ready) return null;

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
