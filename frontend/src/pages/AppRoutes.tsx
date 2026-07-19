// Lazy-load everything except Landing so the marketing page isn't
// blocked by the Lucid WASM bundles. Landing renders immediately; the
// heavy app chunks only download once someone navigates to /app/*.

import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "@/pages/Landing";

const AppShell = lazy(() => import("@/pages/AppShell"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const PostJob = lazy(() => import("@/pages/PostJob"));
const JobDetail = lazy(() => import("@/pages/JobDetail"));
const MyProfile = lazy(() => import("@/pages/MyProfile"));
const PublicProfile = lazy(() => import("@/pages/PublicProfile"));
const MyJobs = lazy(() => import("@/pages/MyJobs"));
const Wallet = lazy(() => import("@/pages/Wallet"));
const Settings = lazy(() => import("@/pages/Settings"));
const DisputeQueue = lazy(() => import("@/pages/DisputeQueue"));

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-text-dim text-[13px]">
        <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        Loading
      </div>
    </div>
  );
}

// Wrapper to avoid repeating <Suspense> at every route.
function L({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loader />}>{children}</Suspense>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<L><AppShell /></L>}>
        <Route index element={<L><Dashboard /></L>} />
        <Route path="marketplace" element={<L><Marketplace /></L>} />
        <Route path="post" element={<L><PostJob /></L>} />
        <Route path="jobs" element={<L><MyJobs /></L>} />
        <Route path="jobs/:id" element={<L><JobDetail /></L>} />
        <Route path="work" element={<L><MyJobs /></L>} />
        <Route path="profile" element={<L><MyProfile /></L>} />
        <Route path="profiles/:address" element={<L><PublicProfile /></L>} />
        <Route path="wallet" element={<L><Wallet /></L>} />
        <Route path="settings" element={<L><Settings /></L>} />
        <Route path="queue" element={<L><DisputeQueue /></L>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}